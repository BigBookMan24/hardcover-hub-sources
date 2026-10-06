import { Response, Chapter, ChapterDetails, ContentRating, PagedResults, SearchRequest, SourceInfo, SourceIntents, SourceManga } from '@paperback/types'
import { CheerioAPI, load } from 'cheerio'
import { gcm } from '@noble/ciphers/aes'
import { SourceTransport } from '../SourceTransport'

const API = 'https://api.mghcdn.com/graphql'
const DOMAIN = 'https://mangahub.io'
const THUMB = 'https://thumb.mghcdn.com/'
const IMAGE = 'https://imgx.mghcdn.com/'
export const MangaHubInfo: SourceInfo = {
    name: 'MangaHub', version: '0.1.0', author: 'Hardcover Hub contributors', icon: 'icon.png',
    description: 'MangaHub reader with support for complete encrypted chapter manifests. Browser verification may be required.',
    websiteBaseURL: DOMAIN, contentRating: ContentRating.MATURE,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class MangaHub extends SourceTransport {
    readonly domain = DOMAIN
    readonly prefix = '/manga/'
    readonly label = 'MangaHub'
    private issuedSession?: { value: string; expires: number }
    private chapterSessionAccess?: string
    private chapterSession?: { keyId: string; key: string; expiresAt: number }
    private sessionPending?: Promise<{ keyId: string; key: string; expiresAt: number }>
    private apiBlockedUntil = 0
    protected override allowedRequest(url: string): boolean { return url === API || super.allowedRequest(url) }
    protected override observeResponse(response: Response, url: string): void {
        if (!url.startsWith(DOMAIN + '/')) return
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
    private accessKey(): string | undefined {
        if (this.issuedSession && this.issuedSession.expires > Date.now()) return this.issuedSession.value
        return this.requestManager.cookieStore?.getAllCookies().find(c => c.name === 'mhub_access'
            && ['mangahub.io', '.mangahub.io'].includes(c.domain)
            && (!c.expires || new Date(c.expires).getTime() > Date.now()))?.value
    }
    private async readerSession(): Promise<{ keyId: string; key: string; expiresAt: number }> {
        if (this.chapterSession && this.chapterSessionAccess === this.accessKey() && this.chapterSession.expiresAt > Date.now() + 30000) return this.chapterSession
        if (this.sessionPending) return this.sessionPending
        this.sessionPending = (async () => {
            if (!this.accessKey()) await this.request(DOMAIN + '/', 'GET', undefined, {}, false)
            const session = JSON.parse(await this.request(DOMAIN + '/api/chapter-crypto', 'GET', undefined, { accept: 'application/json' }, false))
            if (typeof session.keyId !== 'string' || typeof session.key !== 'string' || !Number.isFinite(session.expiresAt)
                || session.expiresAt <= Date.now() || this.decode64(session.key).length !== 32) throw new Error('MangaHub: reader session unavailable. Open the source in the app browser and retry.')
            this.chapterSessionAccess = this.accessKey()
            return this.chapterSession = session
        })()
        try { return await this.sessionPending } finally { this.sessionPending = undefined }
    }
    private decode64(value: string): Uint8Array {
        if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('Invalid chapter encoding.')
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
        const bytes: number[] = []; let bits = 0, buffer = 0
        for (const character of value) {
            buffer = (buffer << 6) | alphabet.indexOf(character); bits += 6
            if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255) }
        }
        return new Uint8Array(bytes)
    }
    browseURL(title: string): string { return `${DOMAIN}/search?q=${encodeURIComponent(title)}&order=POPULAR&genre=all` }
    private media(value: string, prefix: string): string {
        if (!value.startsWith(prefix) || /[\\\s]/.test(value)) throw new Error('MangaHub: unrecognized image host or path.')
        // Preserve the website's image query parameters; discarding them breaks current pages.
        return value
    }
    cards($: CheerioAPI): ReturnType<typeof App.createPartialSourceManga>[] {
        const results: ReturnType<typeof App.createPartialSourceManga>[] = [], seen = new Set<string>()
        $('.media-manga').each((_, el) => {
            const card = $(el), link = card.find('.media-heading a').first()
            const path = (link.attr('href') ?? '').replace(/^https:\/\/mangahub\.io/, '')
            const match = path.match(/^\/manga\/([^/?#]+)\/?$/)
            const title = link.text().trim(), image = card.find('img.manga-thumb').attr('src')
            if (!match || !title || !image) return
            // Keep the existing MATURE catalog rating accurate.
            if (card.find('a[href$="/pornographic"], a[href$="/adult"]').length) return
            const id = this.id(match[1]!)
            if (seen.has(id)) return
            seen.add(id)
            results.push(App.createPartialSourceManga({ mangaId: id, title, image: this.media(image, THUMB) }))
        })
        return results
    }
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const title = query.title?.trim() ?? ''
        const url = metadata?.query === title && typeof metadata.next === 'string' ? this.absolute(metadata.next) : this.browseURL(title)
        const $ = load(await this.fetch(url))
        if (!$('#q').length && !$('.media-manga').length) throw new Error('MangaHub: search unavailable. Check the source status in Settings.')
        const next = $('a[rel="next"], .pager .next a, .pagination .next a').first().attr('href')
            || $('a').filter((_, el) => /^Next\s*(?:→|»)?$/i.test($(el).text().trim())).first().attr('href')
        return App.createPagedResults({ results: this.cards($), metadata: next && next !== url ? { query: title, next: this.absolute(next) } : undefined })
    }
    override async getMangaDetails(id: string): Promise<SourceManga> {
        const $ = await this.detail(id), root = $('#mangadetail'), heading = root.find('h1').first().clone()
        const alternate = heading.find('small').text().trim()
        heading.children().remove()
        const title = heading.text().trim()
        if (!title) throw new Error('MangaHub: title details unavailable.')
        const field = (label: string): string => root.find('span').filter((_, el) => $(el).text().trim() === label).first().next('span').text().trim()
        const genres = root.find('a.genre-label').toArray().map(el => App.createTag({ id: $(el).text().trim().toLowerCase(), label: $(el).text().trim() }))
        return App.createSourceManga({ id, mangaInfo: App.createMangaInfo({
            titles: [title, ...alternate.split(';').map(x => x.trim()).filter(x => x && x !== title)],
            image: this.media(root.find('img.manga-thumb').attr('src') || $('meta[property="og:image"]').attr('content') || '', THUMB),
            desc: $('#chapters-tab-pane-999').text().trim() || $('meta[name="description"]').attr('content') || '',
            author: field('Author'), artist: field('Artist'), status: field('Status') || 'Unknown',
            ...(genres.length ? { tags: [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres })] } : {})
        }) })
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const $ = await this.detail(id), prefix = `/chapter/${this.id(id)}/chapter-`
        const chapters: Chapter[] = [], seen = new Set<string>()
        // All tab panels are present in the server HTML, including the hidden older chapters.
        $('#chapters-tab li.list-group-item').each((_, el) => {
            // Secondary links are alternate copies, not additional chapter numbers.
            const link = $(el).find('a').first()
            const path = (link.attr('href') ?? '').replace(/^https:\/\/mangahub\.io/, '')
            if (!path.startsWith(prefix)) return
            const label = link.clone(); label.find('small').remove()
            // Some links end in database IDs; the displayed number is the stable chapter ID.
            const displayed = label.text().trim().match(/^#?\s*(?:Chapter\s+)?(\d+(?:\.\d+)?)(?=\s|$|[-:])/i)?.[1]
            if (!displayed) return
            const number = String(Number(displayed))
            if (seen.has(number)) return
            seen.add(number)
            chapters.push(App.createChapter({ id: number, name: label.text().replace(/\s+/g, ' ').trim() || `Chapter ${number}`, chapNum: Number(number), langCode: 'en' }))
        })
        if (!chapters.length) throw new Error('MangaHub: chapter list unavailable. Verify the source in the app browser and retry.')
        return chapters.sort((a, b) => b.chapNum - a.chapNum).map((chapter, index) => App.createChapter({ ...chapter, sortingIndex: -index }))
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        if (!/^\d+(?:\.\d+)?$/.test(chapter)) throw new Error('Invalid chapter number.')
        if (Date.now() < this.apiBlockedUntil) throw new Error('MangaHub: rate limited. Wait a minute before retrying.')
        // Match the site's single key refresh when a reader session expires. Never retry rate limits or verification failures.
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const session = await this.readerSession(), access = this.accessKey()
                if (!access) throw new Error('MangaHub: website session unavailable. Open the source in the app browser and retry.')
                const query = `{chapter(x:m01,slug:${JSON.stringify(this.id(id))},number:${Number(chapter)}){pages}}`
                const result = JSON.parse(await this.request(API, 'POST', JSON.stringify({ query }), {
                    'content-type': 'application/json', origin: DOMAIN, 'x-mhub-access': access
                }))
                if (result.errors?.length) {
                    if (result.errors.some((error: any) => /rate.?limit/i.test(error.message ?? ''))) {
                        this.apiBlockedUntil = Date.now() + 60000
                        throw new Error('MangaHub: API rate limited. Wait a minute before retrying.')
                    }
                    if (result.errors.some((error: any) => error.message === 'Chapter encryption unavailable')) {
                        this.chapterSession = undefined
                        if (attempt === 0) continue
                        throw new Error('MangaHub: chapter session unavailable after refresh. Retry later.')
                    }
                    throw new Error('MangaHub: chapter API unavailable. Verify the source in the app browser, then retry later.')
                }
                let encoded = result.data?.chapter?.pages
                if (typeof encoded !== 'string') throw new Error('MangaHub: chapter manifest unavailable.')
                if (encoded.startsWith('enc:v1:')) {
                    const parts = encoded.split(':')
                    if (parts.length !== 6 || parts[2] !== session.keyId) throw new Error('MangaHub: chapter session expired. Please retry.')
                    const iv = this.decode64(parts[3]!), tag = this.decode64(parts[4]!), ciphertext = this.decode64(parts[5]!)
                    if (iv.length !== 12 || tag.length !== 16) throw new Error('MangaHub: invalid encrypted chapter.')
                    const sealed = new Uint8Array(ciphertext.length + tag.length)
                    sealed.set(ciphertext); sealed.set(tag, ciphertext.length)
                    const plain: Uint8Array = gcm(this.decode64(session.key), iv).decrypt(sealed)
                    encoded = decodeURIComponent(Array.from(plain).map(byte => '%' + byte.toString(16).padStart(2, '0')).join(''))
                }
                const payload = JSON.parse(encoded)
                if (typeof payload.p !== 'string' || !Array.isArray(payload.i) || !payload.i.length) throw new Error('MangaHub: full chapter pages unavailable.')
                const pages = payload.i.map((file: unknown) => {
                    if (typeof file !== 'string' || !file) throw new Error('MangaHub: invalid page filename.')
                    const path = payload.p + file
                    if (/^(?:[a-z]+:|\/)|\.\.|[\\\s#]/i.test(path)) throw new Error('MangaHub: invalid page path.')
                    return this.media(IMAGE + path, IMAGE)
                })
                return App.createChapterDetails({ id: chapter, mangaId: id, pages })
            } catch (error) {
                this.chapterSession = undefined
                throw error
            }
        }
        throw new Error('MangaHub: chapter session unavailable.')
    }
}
