import { Chapter, ChapterDetails, ContentRating, PagedResults, SearchRequest, SourceInfo, SourceIntents, SourceManga } from '@paperback/types'
import { CheerioAPI, load } from 'cheerio'
import { SourceTransport } from '../SourceTransport'

const DOMAIN = 'https://toonily.com'
const MEDIA = ['https://static.tnlycdn.com/', 'https://data.tnlycdn.com/']
export const ToonilyInfo: SourceInfo = {
    name: 'Toonily', version: '0.1.0', author: 'Hardcover Hub contributors', icon: 'icon.png',
    description: 'Fresh public-HTML reader for the current Toonily site. Browser verification may be required.',
    websiteBaseURL: DOMAIN, contentRating: ContentRating.ADULT,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

/** Built from the October 2026 public search, title and reader markup. */
export class Toonily extends SourceTransport {
    readonly domain = DOMAIN
    readonly prefix = '/serie/'
    readonly label = 'Toonily'
    browseURL(title: string): string { return title ? `${DOMAIN}/search/${encodeURIComponent(title)}` : DOMAIN + '/' }
    private media(value: string): string {
        const url = value.trim()
        if (!MEDIA.some(prefix => url.startsWith(prefix)) || /[\\\s]/.test(url)) throw new Error('Toonily: unrecognized image host or path.')
        return url
    }
    cards($: CheerioAPI): ReturnType<typeof App.createPartialSourceManga>[] {
        const results: ReturnType<typeof App.createPartialSourceManga>[] = [], seen = new Set<string>()
        $('.page-item-detail.manga, .c-tabs-item__content').each((_, element) => {
            const card = $(element), link = card.find('.post-title a').first().length ? card.find('.post-title a').first() : card.find('.item-thumb a').first()
            const path = (link.attr('href') ?? '').replace(/^https:\/\/toonily\.com/, '')
            const match = path.match(/^\/serie\/([^/?#]+)\/?$/)
            if (!match) return
            const id = this.id(match[1]!), img = card.find('img').first()
            const title = link.text().trim() || link.attr('title')?.trim()
            const image = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src')
            if (!title || !image || seen.has(id)) return
            seen.add(id)
            results.push(App.createPartialSourceManga({ mangaId: id, title, image: this.media(image) }))
        })
        return results
    }
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const title = query.title?.trim() ?? ''
        const url = metadata?.query === title && typeof metadata.next === 'string' ? this.absolute(metadata.next) : this.browseURL(title)
        const $ = load(await this.fetch(url)), results = this.cards($)
        if (!results.length && !$('.no-results, .search-no-results').length && !/\b0\s+RESULTS\b|nothing found|no (?:manga|manhwa|results) found/i.test($('body').text())) {
            throw new Error('Toonily: catalog unavailable. Check the source status in Settings.')
        }
        const next = $('a[rel="next"], a.nextpostslink, a.next.page-numbers').first().attr('href')
        return App.createPagedResults({ results, metadata: next && next !== url ? { query: title, next: this.absolute(next) } : undefined })
    }
    override getMangaShareUrl(id: string): string { return `${DOMAIN}/serie/${this.id(id)}/` }
    override async getMangaDetails(id: string): Promise<SourceManga> {
        const $ = await this.detail(id)
        const heading = $('.post-title h1, #manga-title h1').first().clone()
        heading.find('.manga-title-badges, .manga-title-badge, .badge').remove()
        const title = heading.text().trim()
        if (!title) throw new Error('Toonily: title details unavailable.')
        const field = (pattern: RegExp): string => {
            const row = $('.post-content_item').filter((_, el) => pattern.test($(el).find('.summary-heading').text().trim())).first()
            return row.find('.summary-content').text().trim()
        }
        const cover = $('.summary_image img').first()
        const genres = $('.genres-content a').toArray().map(el => ({ id: $(el).text().trim().toLowerCase(), label: $(el).text().trim() }))
        return App.createSourceManga({ id, mangaInfo: App.createMangaInfo({
            titles: [title], image: this.media(cover.attr('data-src') || cover.attr('src') || ''),
            desc: $('.summary__content').first().text().trim(),
            author: field(/writer|author/i), artist: field(/artist/i), status: field(/^status$/i) || 'Unknown',
            ...(genres.length ? { tags: [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(tag => App.createTag(tag)) })] } : {})
        }) })
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const base = this.getMangaShareUrl(id), $ = await this.detail(id)
        const chapters: Chapter[] = [], seen = new Set<string>()
        $('#tab-chapter-listing li.wp-manga-chapter, .listing-chapters_wrap li.wp-manga-chapter').each((_, el) => {
            const link = $(el).find('a').first(), href = link.attr('href') ?? ''
            const full = href.startsWith('/') ? DOMAIN + href : href
            if (!full.startsWith(base)) return
            const chapter = full.slice(base.length).replace(/\/$/, '')
            if (!/^[a-zA-Z0-9_.~-]+$/.test(chapter) || seen.has(chapter)) return
            const name = link.text().replace(/\s+/g, ' ').trim()
            const number = Number(name.match(/chapter\s*(\d+(?:\.\d+)?)/i)?.[1] ?? chapter.match(/chapter-(\d+(?:\.\d+)?)/)?.[1] ?? 0)
            seen.add(chapter)
            chapters.push(App.createChapter({ id: chapter, name, chapNum: number, langCode: 'en', sortingIndex: -chapters.length }))
        })
        if (!chapters.length) throw new Error('Toonily: chapter list unavailable. Open the source in the app browser and retry.')
        return chapters
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        const $ = load(await this.fetch(`${this.getMangaShareUrl(id)}${this.id(chapter)}/`))
        const pages: string[] = [], seen = new Set<string>()
        $('.reading-content img.wp-manga-chapter-img, .reading-content .page-break img').each((_, el) => {
            const img = $(el), value = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src')
            if (!value) return
            const url = this.media(value)
            if (!seen.has(url)) { seen.add(url); pages.push(url) }
        })
        if (!pages.length) throw new Error('Toonily: reader pages unavailable. Check the source status in Settings.')
        return App.createChapterDetails({ id: chapter, mangaId: id, pages })
    }
}
