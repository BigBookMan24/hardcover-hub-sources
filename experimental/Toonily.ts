import { Chapter, ChapterDetails, SourceManga } from '@paperback/types'
import { CheerioAPI, load } from 'cheerio'
import { chapterNumber } from '../src/HtmlReader'
import { ExperimentalReader } from './Transport'

/** Madara endpoint/selector adaptation. Deliberately excluded from the published catalog pending live tests. */
export class Toonily extends ExperimentalReader {
    readonly domain = 'https://toonily.com'
    readonly prefix = '/serie/'
    readonly label = 'Toonily'
    browseURL(title: string): string { return `${this.domain}/?s=${encodeURIComponent(title)}&post_type=wp-manga` }
    private media(value: string): string {
        const url = value.trim()
        // Hosts verified in the current site's cover and chapter DOM.
        if (!/^https:\/\/(?:static|data)\.tnlycdn\.com\/[^\s]+$/i.test(url)) throw new Error('Unrecognized Toonily media host.')
        return url
    }
    cards($: CheerioAPI): ReturnType<typeof App.createPartialSourceManga>[] {
        const results: ReturnType<typeof App.createPartialSourceManga>[] = [], seen = new Set<string>()
        $('div.page-item-detail.manga, div.c-tabs-item__content').each((_, element) => {
            const card = $(element), link = card.find('a[href*="/serie/"]').first()
            const href = link.attr('href') ?? ''
            if (!href.startsWith(this.domain + this.prefix) && !href.startsWith(this.prefix)) return
            const id = href.match(/\/serie\/([^/?#]+)\/?$/)?.[1]
            const title = card.find('.post-title a').first().text().trim() || link.attr('title')?.trim()
            const img = card.find('img').first(), value = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src')
            if (!id || !title || !value || seen.has(id)) return
            seen.add(id)
            results.push(App.createPartialSourceManga({ mangaId: this.id(id), title, image: this.media(value) }))
        })
        return results
    }
    override async getMangaDetails(id: string): Promise<SourceManga> {
        const $ = await this.detail(id)
        const title = $('.post-title h1, #manga-title h1').first().children().remove().end().text().trim()
        if (!title) throw new Error('Toonily title markup unavailable.')
        const img = $('.summary_image img').first()
        return App.createSourceManga({ id, mangaInfo: App.createMangaInfo({ titles: [title],
            image: this.media(img.attr('data-src') || img.attr('src') || ''),
            desc: $('.summary__content, .description-summary, .summary-container').first().text().trim(),
            author: $('.author-content').text().trim(), status: 'Unknown'
        }) })
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const base = this.getMangaShareUrl(id)
        let $ = await this.detail(id)
        // Current pages may include the entire list already; avoid an unnecessary POST.
        if (!$('li.wp-manga-chapter a').length) {
            $ = load(await this.request(base + '/ajax/chapters', 'POST', '', { 'content-type': 'application/x-www-form-urlencoded' }))
        }
        const chapters: Chapter[] = [], seen = new Set<string>()
        $('li.wp-manga-chapter a').each((_, element) => {
            const a = $(element), href = a.attr('href') ?? ''
            const full = href.startsWith('/') ? this.domain + href : href
            if (!full.startsWith(base + '/')) return
            const chapter = full.slice(base.length + 1).replace(/\/$/, '')
            if (!/^[\w.-]+$/.test(chapter) || seen.has(chapter)) return
            seen.add(chapter)
            const name = a.text().trim()
            chapters.push(App.createChapter({ id: chapter, name, chapNum: chapterNumber(name), langCode: 'en', sortingIndex: -chapters.length }))
        })
        if (!chapters.length) throw new Error('Toonily chapter list unavailable.')
        return chapters
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        const $ = load(await this.fetch(`${this.getMangaShareUrl(id)}/${this.id(chapter)}/?style=list`))
        const pages: string[] = []
        $('div.page-break > img').each((_, el) => {
            const img = $(el), value = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src')
            if (value) pages.push(this.media(value))
        })
        if (!pages.length) throw new Error('Toonily reader images unavailable. Protected readers are not supported by this draft.')
        return App.createChapterDetails({ id: chapter, mangaId: id, pages })
    }
}
