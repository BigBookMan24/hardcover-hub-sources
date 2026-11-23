import { Chapter, ChapterDetails, ContentRating, PagedResults, SearchRequest, SourceInfo, SourceIntents, SourceManga } from '@paperback/types'
import { load } from 'cheerio'
import { SourceTransport } from '../SourceTransport'

const DOMAIN = 'https://kagane.moe'
const API = DOMAIN + '/api/v2'
// Literal origins also allow Hardcover to show the source's network permissions at install time.
const MEDIA_ORIGINS = [DOMAIN, 'https://kstatic.to', 'https://yuzuki.kagane.to', 'https://akari.kagane.to']
export const KaganeInfo: SourceInfo = {
    name: 'Kagane', version: '0.1.2', author: 'Hardcover Hub contributors', icon: 'icon.png',
    description: 'Experimental English Kagane source. Safe and Suggestive catalog; browser verification may be required. On-device reading still needs verification.',
    websiteBaseURL: DOMAIN, contentRating: ContentRating.MATURE,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}
interface Book {
    book_id: string; title?: string; chapter_no?: string; volume_no?: string; sort_no: number;
    created_at?: string; groups?: { title: string }[]
}
interface Series {
    title: string; description?: string; upload_status?: string; content_lang?: string;
    series_covers?: { image_id: string }[]; series_alternate_titles?: { title: string }[];
    series_staff?: { name: string; role: string }[]; genres?: { genre_name: string }[];
    series_books?: Book[]
}
interface SearchPage {
    content: { series_id: string; title: string; cover_image_id?: string }[];
    last?: boolean; total_pages?: number
}
interface Reader {
    access_token: string; cache_url: string;
    manifest?: { pages: { page_no: number; page_id: string; ext?: string }[] }
}

export class Kagane extends SourceTransport {
    readonly domain = DOMAIN
    readonly prefix = '/series/'
    readonly label = 'Kagane'
    private integrity?: { token: string; expires: number }
    private integrityRequest?: Promise<string>
    browseURL(): string { return DOMAIN + '/search' }
    cards(): never[] { throw new Error('Kagane uses its JSON catalog.') }
    private identifier(value: string): string {
        if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Kagane: invalid identifier.')
        return value
    }
    override getMangaShareUrl(id: string): string { return DOMAIN + this.prefix + this.identifier(id) }
    private async json<T>(path: string, body?: object, headers: Record<string, string> = {}): Promise<T> {
        const text = await this.request(DOMAIN + path, body ? 'POST' : 'GET', body ? JSON.stringify(body) : undefined, { accept: 'application/json', 'content-type': 'application/json', ...headers })
        try {
            const result = JSON.parse(text)
            if (!result || typeof result !== 'object' || result.error) throw new Error()
            return result as T
        } catch { throw new Error('Kagane: API response unavailable. Verify access in the app browser and retry.') }
    }
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const title = query.title?.trim() ?? ''
        const page = metadata?.query === title && Number.isInteger(metadata.page) && metadata.page >= 0 ? metadata.page : 0
        const result = await this.json<SearchPage>(`/api/v2/search/series?page=${page}&size=35`, {
            ...(title ? { title } : {}), content_lang: ['en'], content_rating: ['Safe', 'Suggestive'], source_type: ['Official', 'Unofficial', 'Mixed']
        })
        if (!Array.isArray(result.content)) throw new Error('Kagane: search format changed.')
        const seen = new Set<string>()
        const results = result.content.flatMap(row => {
            if (!row?.series_id || !row.title?.trim() || seen.has(row.series_id)) return []
            const id = this.identifier(row.series_id)
            seen.add(id)
            return [App.createPartialSourceManga({ mangaId: id, title: row.title.trim(), image: row.cover_image_id ? `${API}/image/${this.identifier(row.cover_image_id)}` : '' })]
        })
        const hasMore = result.content.length > 0 && (result.last === false || (result.last === undefined && typeof result.total_pages === 'number' && page + 1 < result.total_pages))
        return App.createPagedResults({ results, metadata: hasMore ? { query: title, page: page + 1 } : undefined })
    }
    private async series(id: string): Promise<Series> {
        const result = await this.json<Series>(`/api/v2/series/${this.identifier(id)}`)
        if (typeof result.title !== 'string' || !result.title.trim()) throw new Error('Kagane: title details unavailable.')
        return result
    }
    override async getMangaDetails(id: string): Promise<SourceManga> {
        const value = await this.series(id)
        const staff = (pattern: RegExp) => [...new Set((value.series_staff ?? []).filter(s => pattern.test(s.role)).map(s => s.name))].join(', ')
        const cover = value.series_covers?.[0]?.image_id
        const genres = (value.genres ?? []).map(g => App.createTag({ id: g.genre_name.toLowerCase(), label: g.genre_name }))
        return App.createSourceManga({ id, mangaInfo: App.createMangaInfo({
            titles: [...new Set([value.title, ...(value.series_alternate_titles ?? []).map(t => t.title).filter(Boolean)])],
            image: cover ? `${API}/image/${this.identifier(cover)}` : '',
            desc: load(value.description ?? '').text().trim(), author: staff(/author|story/i), artist: staff(/artist|^art$/i),
            status: value.upload_status ?? 'Unknown',
            ...(genres.length ? { tags: [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres })] } : {})
        }) })
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const value = await this.series(id)
        if (!Array.isArray(value.series_books) || !value.series_books.length) throw new Error('Kagane: chapter list unavailable.')
        const seen = new Set<string>()
        return value.series_books.slice().sort((a, b) => b.sort_no - a.sort_no).flatMap((book, index) => {
            const chapter = this.identifier(book.book_id)
            if (seen.has(chapter)) return []
            seen.add(chapter)
            const number = Number(book.chapter_no ?? book.sort_no)
            const time = new Date(book.created_at ?? '')
            return [App.createChapter({ id: chapter, name: book.title?.trim() || `Chapter ${book.chapter_no ?? book.sort_no}`,
                chapNum: Number.isFinite(number) ? number : book.sort_no, langCode: value.content_lang || 'en', sortingIndex: -index,
                ...(book.groups?.length ? { group: book.groups.map(g => g.title).join(', ') } : {}),
                ...(Number.isFinite(time.getTime()) ? { time } : {})
            })]
        })
    }
    private async session(): Promise<string> {
        if (this.integrity && this.integrity.expires > Date.now() + 5000) return this.integrity.token
        if (this.integrityRequest) return this.integrityRequest
        this.integrityRequest = (async () => {
            await this.fetch(DOMAIN + '/')
            const response = await this.json<{ token: string; exp: number }>('/api/integrity', {})
            if (typeof response.token !== 'string' || !response.token || !Number.isFinite(response.exp) || response.exp * 1000 <= Date.now()) {
                throw new Error('Kagane: reader session unavailable. Open the source in the app browser and retry.')
            }
            this.integrity = { token: response.token, expires: response.exp * 1000 }
            return response.token
        })()
        try { return await this.integrityRequest } finally { this.integrityRequest = undefined }
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        this.identifier(id); this.identifier(chapter)
        const token = await this.session()
        let result: Reader
        try {
            result = await this.json<Reader>(`/api/v2/books/${chapter}?is_datasaver=false`, {}, { 'x-integrity-token': token })
        } catch (error) {
            // A user-initiated retry must not keep using a rejected reader session.
            this.integrity = undefined
            throw error
        }
        const origin = result.cache_url?.replace(/\/$/, '')
        if (!MEDIA_ORIGINS.includes(origin)) throw new Error('Kagane: image server changed. Update the source before allowing the new server.')
        const manifest = result.manifest
        if (typeof result.access_token !== 'string' || !result.access_token || !manifest || !Array.isArray(manifest.pages) || !manifest.pages.length) {
            throw new Error('Kagane: reader pages unavailable.')
        }
        const seen = new Set<number>()
        const pages = manifest.pages.slice().sort((a, b) => a.page_no - b.page_no).map(page => {
            if (!Number.isInteger(page.page_no) || page.page_no < 0 || seen.has(page.page_no)) throw new Error('Kagane: invalid page order.')
            seen.add(page.page_no)
            const ext = page.ext ?? 'jxl'
            if (!/^(?:jpg|jpeg|png|webp|avif|jxl)$/.test(ext)) throw new Error('Kagane: unsupported image format.')
            return `${origin}/api/v2/books/page/${chapter}/${this.identifier(page.page_id)}.${ext}?token=${encodeURIComponent(result.access_token)}`
        })
        return App.createChapterDetails({ id: chapter, mangaId: id, pages })
    }
}
