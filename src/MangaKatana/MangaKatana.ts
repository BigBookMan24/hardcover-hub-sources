import { Chapter, ChapterDetails, ContentRating, SourceInfo, SourceIntents } from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { HtmlReader, chapterNumber, imageURL } from '../HtmlReader'
const DOMAIN = 'https://mangakatana.com'
const IMAGE_HOSTS = [DOMAIN, 'https://i1.mangakatana.com']
export const MangaKatanaInfo: SourceInfo = {
    version: '0.1.0', name: 'MangaKatana', icon: 'icon.png', author: 'Hardcover Hub contributors',
    description: 'Experimental MangaKatana reader, one request per second with throttling backoff. Not affiliated with the website.',
    contentRating: ContentRating.MATURE, websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}
export class MangaKatana extends HtmlReader {
    readonly domain = DOMAIN
    readonly prefix = '/manga/'
    readonly label = 'MangaKatana'
    browseURL(title: string): string {
        return title ? `${DOMAIN}/?search=${encodeURIComponent(title)}&search_by=book_name` : `${DOMAIN}/latest/?filter=1&include_mode=or&chapters=e1&order=az`
    }
    cards($: CheerioAPI): ReturnType<typeof App.createPartialSourceManga>[] {
        const result: ReturnType<typeof App.createPartialSourceManga>[] = []
        $('#book_list .item').each((_, element) => {
            const item = $(element), link = item.find('.title a').first()
            const id = link.attr('href')?.match(/\/manga\/([^/?#]+)\/?$/)?.[1]
            const img = item.find('.wrap_img img').first()
            const image = img.attr('data-src') || img.attr('src') || ''
            const title = link.text().trim()
            if (id && title && image.startsWith(DOMAIN + '/')) result.push(App.createPartialSourceManga({ mangaId: id, title, image }))
        })
        return result
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const $ = await this.detail(id), result: Chapter[] = [], seen = new Set<string>()
        $('.chapters a[href]').each((_, element) => {
            const a = $(element), href = a.attr('href') ?? ''
            if (!href.startsWith(this.getMangaShareUrl(id) + '/')) return
            const chapter = href.split('/').pop() ?? ''
            if (!/^c\d+(?:\.\d+)?$/.test(chapter) || seen.has(chapter)) return
            seen.add(chapter)
            result.push(App.createChapter({ id: chapter, name: a.text().trim(), chapNum: chapterNumber(chapter), langCode: 'en', sortingIndex: -result.length }))
        })
        if (!result.length) throw new Error('No chapter list found.')
        return result
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        const html = await this.fetch(`${this.getMangaShareUrl(id)}/${this.id(chapter)}`)
        // Read the literal page array only; never evaluate arbitrary site JavaScript.
        const array = html.match(/\bvar\s+thzq\s*=\s*\[([\s\S]*?)\]\s*;/)?.[1]
        if (!array) throw new Error('Reader page array unavailable.')
        const pages: string[] = []
        const strings = /'([^'\r\n]*)'|"([^"\r\n]*)"/g
        let match: RegExpExecArray | null
        while ((match = strings.exec(array)) !== null) pages.push(imageURL((match[1] ?? match[2] ?? '').replace(/\\\//g, '/'), IMAGE_HOSTS))
        if (!pages.length) throw new Error('Reader returned no pages.')
        return App.createChapterDetails({ id: chapter, mangaId: id, pages })
    }
}
