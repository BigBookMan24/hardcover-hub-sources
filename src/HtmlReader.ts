import { Chapter, ChapterDetails, ChapterProviding, HomePageSectionsProviding, HomeSection, HomeSectionType, MangaProviding, PagedResults, SearchRequest, SearchResultsProviding, SourceManga } from '@paperback/types'
import { load, CheerioAPI } from 'cheerio'

/** Shared public-HTML reader. Never executes scripts from a source website. */
export abstract class HtmlReader implements ChapterProviding, MangaProviding, SearchResultsProviding, HomePageSectionsProviding {
    abstract readonly domain: string
    abstract readonly prefix: string
    abstract readonly label: string
    abstract browseURL(title: string): string
    abstract cards($: CheerioAPI): ReturnType<typeof App.createPartialSourceManga>[]
    abstract getChapters(id: string): Promise<Chapter[]>
    abstract getChapterDetails(id: string, chapter: string): Promise<ChapterDetails>
    private cached?: { url: string; html: string; expires: number }
    private retryAfter = 0
    requestManager = App.createRequestManager({ requestsPerSecond: 1, requestTimeout: 20000 })

    protected async fetch(url: string): Promise<string> {
        if (!url.startsWith(this.domain + '/')) throw new Error('Unexpected source host.')
        if (Date.now() < this.retryAfter) throw new Error('Source is rate-limiting requests. Wait a minute before retrying.')
        if (this.cached?.url === url && this.cached.expires > Date.now()) return this.cached.html
        const response = await this.requestManager.schedule(App.createRequest({
            url, method: 'GET', headers: { referer: this.domain + '/', 'user-agent': await this.requestManager.getDefaultUserAgent() }
        }), 1)
        if (response.status === 429) this.retryAfter = Date.now() + 60000
        if (response.status !== 200) throw new Error(`${this.label}: HTTP ${response.status}. Access may be restricted; no automatic bypass is attempted.`)
        const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        if (/Just a moment\.\.\.|cf-chl-|challenge-platform\/h\//i.test(html)) throw new Error(`${this.label} requires a browser verification. Automated access is unavailable.`)
        this.cached = { url, html, expires: Date.now() + 30000 }
        return html
    }
    protected id(id: string): string {
        if (!/^[a-zA-Z0-9_.%~-]+$/.test(id) || id === '.' || id === '..') throw new Error('Invalid title or chapter ID.')
        const decoded = decodeURIComponent(id)
        if (/[\\/?#]/.test(decoded) || decoded === '.' || decoded === '..') throw new Error('Invalid title or chapter ID.')
        return id
    }
    getMangaShareUrl(id: string): string { return this.domain + this.prefix + this.id(id) }
    protected async detail(id: string): Promise<CheerioAPI> { return load(await this.fetch(this.getMangaShareUrl(id))) }
    async getMangaDetails(id: string): Promise<SourceManga> {
        const $ = await this.detail(id)
        const title = $('h1[itemprop="name"], h1.heading').first().text().trim()
        if (!title) throw new Error('Title markup changed or access is restricted.')
        return App.createSourceManga({ id, mangaInfo: App.createMangaInfo({
            titles: [title], image: $('meta[property="og:image"]').attr('content') ?? '',
            desc: $('[itemprop="description"], .summary').first().text().trim(),
            author: $('.authors').first().text().trim(),
            status: $('.status').first().text().trim() || 'Unknown'
        }) })
    }
    protected absolute(href: string): string {
        if (href.startsWith('/')) return this.domain + href
        if (href.startsWith(this.domain + '/')) return href
        throw new Error('Unexpected navigation host.')
    }
    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const title = query.title?.trim() ?? ''
        const url = metadata?.query === title && typeof metadata?.next === 'string' ? this.absolute(metadata.next) : this.browseURL(title)
        const $ = load(await this.fetch(url))
        const results = this.cards($)
        const next = $('a[rel="next"], a.next.page-numbers').first().attr('href')
            || $('a[href*="cursor="]').filter((_, element) => $(element).text().trim() === 'Next').first().attr('href')
        return App.createPagedResults({ results, metadata: next && next !== url ? { next: this.absolute(next), query: title } : undefined })
    }
    async getHomePageSections(callback: (section: HomeSection) => void): Promise<void> {
        const result = await this.getSearchResults({ title: '' } as SearchRequest, undefined)
        callback(App.createHomeSection({ id: 'latest', title: this.label, type: HomeSectionType.singleRowNormal, items: result.results, containsMoreItems: !!result.metadata }))
    }
    async getViewMoreItems(section: string, metadata: any): Promise<PagedResults> {
        if (section !== 'latest') throw new Error('Unknown home section.')
        return this.getSearchResults({ title: '' } as SearchRequest, metadata)
    }
}

export function chapterNumber(name: string): number { return Number(name.match(/(?:chapter\s*|^c)(\d+(?:\.\d+)?)/i)?.[1] ?? 0) }
export function imageURL(value: string, allowed: string[]): string {
    if (!allowed.some(host => value.startsWith(host + '/'))) throw new Error('Image host changed. Update the extension before allowing the new host.')
    return value
}
