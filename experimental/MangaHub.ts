import { Chapter, ChapterDetails, PagedResults, SearchRequest, SourceManga, Response } from '@paperback/types'
import { ExperimentalReader } from './Transport'
const API = 'https://api.mghcdn.com/graphql'
const THUMB = 'https://thumb.mghcdn.com/'
const IMAGE = 'https://imgx.mghcdn.com/'
interface Manga { slug: string; title: string; image: string; description?: string; author?: string; status?: string; chapters?: { number: number; title?: string }[] }
interface Result { data?: { search?: { rows: Manga[] }; manga?: Manga; chapter?: { pages: string } }; errors?: { message: string }[] }

/** 0.8 adapter for MangaHub's GraphQL protocol. No key rotation or rate-limit evasion. */
export class MangaHub extends ExperimentalReader {
    readonly domain = 'https://mangahub.io'
    readonly prefix = '/manga/'
    readonly label = 'MangaHub'
    private apiBlockedUntil = 0
    private issuedSession?: { value: string; expires: number }
    browseURL(): string { return this.domain + '/search/' }
    cards(): never[] { throw new Error('MangaHub uses GraphQL, not HTML cards.') }
    protected override allowedRequest(url: string): boolean { return url === API || super.allowedRequest(url) }
    private key(): string | undefined {
        if (this.issuedSession && this.issuedSession.expires > Date.now()) return this.issuedSession.value
        return this.requestManager.cookieStore?.getAllCookies().find(c =>
            c.name === 'mhub_access' && ['mangahub.io', '.mangahub.io'].includes(c.domain) && (!c.expires || new Date(c.expires).getTime() > Date.now())
        )?.value
    }
    protected override observeResponse(response: Response, url: string): void {
        if (!url.startsWith(this.domain + '/')) return
        // 0.8 hosts expose cookies differently. Support a normal Set-Cookie response
        // when the optional cookieStore is unavailable; never obtain desktop cookies.
        for (const [name, header] of Object.entries(response.headers ?? {})) {
            if (name.toLowerCase() !== 'set-cookie') continue
            for (const value of Array.isArray(header) ? header : [header]) {
                if (typeof value !== 'string') continue
                const token = value.match(/(?:^|,\s*)mhub_access=([^;,\s]+)/)?.[1]
                if (!token) continue
                const domain = value.match(/;\s*domain=([^;\s]+)/i)?.[1]
                if (domain && !['mangahub.io', '.mangahub.io'].includes(domain.toLowerCase())) continue
                const age = value.match(/;\s*max-age=(-?\d+)/i)?.[1]
                const expiration = value.match(/;\s*expires=([^;]+)/i)?.[1]
                const expires = age !== undefined ? Date.now() + Number(age) * 1000 : expiration ? Date.parse(expiration) : Date.now() + 30 * 60 * 1000
                if (Number.isFinite(expires) && expires > Date.now()) this.issuedSession = { value: token, expires }
            }
        }
    }
    private async graphql(query: string): Promise<Result['data']> {
        if (Date.now() < this.apiBlockedUntil) throw new Error('MangaHub rate limited. Wait a minute before retrying.')
        if (!this.key()) await this.fetch(this.domain + '/')
        const key = this.key()
        if (!key) throw new Error('MangaHub session unavailable. Open the source in the app browser to establish a session.')
        const body = await this.request(API, 'POST', JSON.stringify({ query }), { 'content-type': 'application/json', 'x-mhub-access': key })
        let result: Result
        try { result = JSON.parse(body) } catch { throw new Error('MangaHub returned invalid JSON.') }
        if (result.errors?.length) {
            if (result.errors.some(e => /rate.?limit/i.test(e.message))) this.apiBlockedUntil = Date.now() + 60000
            // Do not echo potentially sensitive server details/session identifiers.
            throw new Error('MangaHub API rejected the request. Check the session or retry later.')
        }
        if (!result.data) throw new Error('MangaHub response data unavailable.')
        return result.data
    }
    private thumbnail(value: string): string {
        if (value?.startsWith(THUMB)) return value
        if (!value || /^(?:[a-z]+:|\/)|\.\.|[\\\s?#]/i.test(value)) throw new Error('Invalid MangaHub thumbnail.')
        return THUMB + value
    }
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const title = query.title?.trim() ?? ''
        const page = metadata?.query === title && Number.isSafeInteger(metadata?.page) && metadata.page > 0 ? metadata.page : 1
        const data = await this.graphql(`{search(x:m01,q:${JSON.stringify(title)},genre:"all",mod:POPULAR,offset:${(page - 1) * 30}){rows{title slug image}}}`)
        const rows = data?.search?.rows
        if (!Array.isArray(rows)) throw new Error('MangaHub search schema changed.')
        const seen = new Set<string>()
        const results = rows.filter(row => { if (!row.slug || !row.title || !row.image || seen.has(row.slug)) return false; seen.add(row.slug); return true })
            .map(row => App.createPartialSourceManga({ mangaId: this.id(row.slug), title: row.title, image: this.thumbnail(row.image) }))
        return App.createPagedResults({ results, metadata: rows.length === 30 ? { page: page + 1, query: title } : undefined })
    }
    override async getMangaDetails(id: string): Promise<SourceManga> {
        const data = await this.graphql(`{manga(x:m01,slug:${JSON.stringify(this.id(id))}){title slug status image author description}}`)
        const manga = data?.manga
        if (!manga?.title) throw new Error('MangaHub title unavailable.')
        return App.createSourceManga({ id, mangaInfo: App.createMangaInfo({ titles: [manga.title], image: this.thumbnail(manga.image), desc: manga.description ?? '', author: manga.author ?? '', status: manga.status ?? 'Unknown' }) })
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const data = await this.graphql(`{manga(x:m01,slug:${JSON.stringify(this.id(id))}){slug chapters{number title}}}`)
        const chapters = data?.manga?.chapters
        if (!chapters?.length) throw new Error('MangaHub chapters unavailable.')
        return [...chapters].sort((a, b) => b.number - a.number).map((ch, index) => {
            if (!Number.isFinite(ch.number) || ch.number < 0) throw new Error('Invalid chapter number.')
            return App.createChapter({ id: String(ch.number), name: ch.title || `Chapter ${ch.number}`, chapNum: ch.number, langCode: 'en', sortingIndex: -index })
        })
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        if (!/^\d+(?:\.\d+)?$/.test(chapter)) throw new Error('Invalid chapter number.')
        const data = await this.graphql(`{chapter(x:m01,slug:${JSON.stringify(this.id(id))},number:${Number(chapter)}){pages}}`)
        let payload: { p: string; i: string[] }
        try { payload = JSON.parse(data?.chapter?.pages ?? '') } catch { throw new Error('MangaHub page data invalid.') }
        if (typeof payload.p !== 'string' || !Array.isArray(payload.i) || !payload.i.length) throw new Error('MangaHub pages unavailable.')
        const pages = payload.i.map(file => {
            if (typeof file !== 'string' || !file) throw new Error('Invalid page filename.')
            const path = payload.p + file
            if (/^(?:[a-z]+:|\/)|\.\.|[\\\s?#]/i.test(path)) throw new Error('Invalid page path.')
            return IMAGE + path
        })
        return App.createChapterDetails({ id: chapter, mangaId: id, pages })
    }
}
