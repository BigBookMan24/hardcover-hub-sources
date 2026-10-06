import { Chapter, ChapterDetails, ContentRating, PagedResults, SearchRequest, SourceInfo, SourceIntents, SourceManga } from '@paperback/types'
import { CheerioAPI, load } from 'cheerio'
import { SourceTransport } from '../SourceTransport'

const DOMAIN = 'https://toonily.com'
const MEDIA = ['https://static.tnlycdn.com/', 'https://data.tnlycdn.com/']
export const ToonilyInfo: SourceInfo = {
    name: 'Toonily', version: '0.1.2', author: 'Hardcover Hub contributors', icon: 'icon.png',
    description: 'Fresh public-HTML reader for the current Toonily site. Browser verification may be required.',
    websiteBaseURL: DOMAIN, contentRating: ContentRating.MATURE,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

/** Built from the October 2026 public search, title and reader markup. */
export class Toonily extends SourceTransport {
    readonly domain = DOMAIN
    readonly prefix = '/serie/'
    readonly label = 'Toonily'
    browseURL(title: string): string { return title ? `${DOMAIN}/search/${encodeURIComponent(title)}` : DOMAIN + '/' }
    async getSearchTags() {
        const $ = load(await this.fetch(DOMAIN + '/search/beginning'))
        const group = (id: string, label: string, field: string, prefix: string) => {
            const tags: ReturnType<typeof App.createTag>[] = []
            $(`.search-advanced-form input[name="${field}"]`).each((_, el) => {
                const value = $(el).attr('value') ?? ''
                const label = $(el).closest('label').text().trim()
                if (value && label) tags.push(App.createTag({ id: prefix + ':' + value, label }))
            })
            return App.createTagSection({ id, label, tags })
        }
        const genres = group('genres', 'Genres', 'genre[]', 'genre')
        if (!genres.tags.length) throw new Error('Toonily: search filters unavailable. Open the source website and retry.')
        return [genres,
            group('status', 'Status', 'status[]', 'status'),
            group('content:single', 'Content', 'adult', 'adult'),
            App.createTagSection({ id: 'match:single', label: 'Genre matching', tags: [
                App.createTag({ id: 'op:0', label: 'Match any genre' }),
                App.createTag({ id: 'op:1', label: 'Match all genres' })
            ] }),
            App.createTagSection({ id: 'sort:single', label: 'Sort', tags: [
                ['', 'Relevance'], ['latest', 'Latest'], ['alphabet', 'A–Z'], ['rating', 'Rating'],
                ['trending', 'Trending'], ['views', 'Most Views'], ['new-manga', 'New']
            ].map(([id, label]) => App.createTag({ id: 'sort:' + id, label: label! })) }),
            // Text fields use the same tag transport; Hardcover supplies their typed values.
            App.createTagSection({ id: 'author:text', label: 'Writer', tags: [App.createTag({ id: 'author:', label: 'Writer name' })] }),
            App.createTagSection({ id: 'artist:text', label: 'Artist', tags: [App.createTag({ id: 'artist:', label: 'Artist name' })] })
        ]
    }
    private searchURL(query: SearchRequest): string {
        const title = query.title?.trim() ?? ''
        const tags = [...new Set((query.includedTags ?? []).map(tag => tag.id))].sort()
        if (!tags.length) return this.browseURL(title)
        const parameters: [string, string][] = [['post_type', 'wp-manga'], ['s', title]]
        for (const tag of tags) {
            const split = tag.indexOf(':'), key = tag.slice(0, split), value = tag.slice(split + 1)
            if (split < 0 || value.length > 200) continue
            if (key === 'genre' && /^[a-z0-9-]+$/.test(value)) parameters.push(['genre[]', value])
            if (key === 'status' && ['on-going', 'end', 'canceled', 'on-hold'].includes(value)) parameters.push(['status[]', value])
            if (key === 'sort' && ['', 'latest', 'alphabet', 'rating', 'trending', 'views', 'new-manga'].includes(value)) parameters.push(['m_orderby', value])
            if (['adult', 'op'].includes(key) && ['0', '1'].includes(value)) parameters.push([key, value])
            if (['author', 'artist'].includes(key) && value.trim()) parameters.push([key, value.trim()])
        }
        return DOMAIN + '/?' + parameters.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
    }
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
        const queryKey = this.searchURL(query)
        const url = metadata?.query === queryKey && typeof metadata.next === 'string' ? this.absolute(metadata.next) : queryKey
        const $ = load(await this.fetch(url)), results = this.cards($)
        if (!results.length && !$('.no-results, .search-no-results').length && !/\b0\s+RESULTS\b|nothing found|no (?:manga|manhwa|results) found/i.test($('body').text())) {
            throw new Error('Toonily: catalog unavailable. Check the source status in Settings.')
        }
        const next = $('a[rel="next"], a.nextpostslink, a.next.page-numbers').first().attr('href')
        return App.createPagedResults({ results, metadata: next && next !== url ? { query: queryKey, next: this.absolute(next) } : undefined })
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
        const result = App.createSourceManga({ id, mangaInfo: App.createMangaInfo({
            titles: [title], image: this.media(cover.attr('data-src') || cover.attr('src') || ''),
            desc: $('.summary__content').first().text().trim(),
            author: field(/writer|author/i), artist: field(/artist/i), status: field(/^status$/i) || 'Unknown',
            ...(genres.length ? { tags: [App.createTagSection({ id: 'genres', label: 'Genres', tags: genres.map(tag => App.createTag(tag)) })] } : {})
        }) })
        // Mirror the site's actual per-title Family/R classification, not the extension rating.
        ;(result.mangaInfo as any).hardcoverRequiresRMode = $('body').hasClass('adult-content')
        return result
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
