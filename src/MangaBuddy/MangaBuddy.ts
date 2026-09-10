import { Chapter, ChapterDetails, ContentRating, SourceInfo, SourceIntents } from '@paperback/types'
import { CheerioAPI, load } from 'cheerio'
import { HtmlReader, chapterNumber, imageURL } from '../HtmlReader'

const DOMAIN = 'https://mangabuddy1.co.uk'
const IMAGE_HOSTS = ['https://cdn1.love4awalk.xyz', DOMAIN]
export const MangaBuddyInfo: SourceInfo = {
    version: '0.1.0', name: 'MangaBuddy', icon: 'icon.png', author: 'Hardcover Hub contributors',
    description: 'Experimental public-HTML MangaBuddy reader. Excludes marked adult catalog cards. Not affiliated with the website.',
    contentRating: ContentRating.MATURE, websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}
export class MangaBuddy extends HtmlReader {
    readonly domain = DOMAIN
    readonly prefix = '/series/'
    readonly label = 'MangaBuddy'
    browseURL(title: string): string { return `${DOMAIN}/series${title ? '?searchTerm=' + encodeURIComponent(title) : ''}` }
    cards($: CheerioAPI): ReturnType<typeof App.createPartialSourceManga>[] {
        const results: ReturnType<typeof App.createPartialSourceManga>[] = []
        const seen = new Set<string>()
        $('a[href*="/series/"]').each((_, element) => {
            const a = $(element)
            if (a.closest('.nsfw-cover-container').length || a.find('.nsfw-cover-container, .nsfw-blur').length) return
            const href = a.attr('href') ?? ''
            const id = href.match(/\/series\/([^/?#]+)\/?$/)?.[1]
            const img = a.find('img').first()
            const title = a.attr('title')?.trim() || img.attr('alt')?.trim()
            const image = img.attr('data-src') || img.attr('src')
            if (!id || !title || !image || seen.has(id)) return
            if (!IMAGE_HOSTS.some(host => image.startsWith(host + '/'))) return
            seen.add(id)
            results.push(App.createPartialSourceManga({ mangaId: id, title, image }))
        })
        return results
    }
    async getChapters(id: string): Promise<Chapter[]> {
        const $ = await this.detail(id)
        const slug = $('#load-all-chapters-btn').attr('data-comic-slug')
        if (slug) {
            const json = JSON.parse(await this.fetch(`${DOMAIN}/get-chapter-list?slug=${encodeURIComponent(slug)}`))
            if (json.success !== true || !Array.isArray(json.data) || !json.data.length) throw new Error('Full chapter list unavailable.')
            const seen = new Set<string>()
            return json.data.map((row: any, index: number) => {
                const chapter = this.id(String(row.chapter_slug || `chapter-${row.chapter_num}`))
                if (seen.has(chapter)) return undefined
                seen.add(chapter)
                const time = new Date(row.updated_at)
                return App.createChapter({ id: chapter, name: String(row.chapter_name), chapNum: Number(row.chapter_num) || chapterNumber(row.chapter_name), langCode: 'en', sortingIndex: json.data.length - index, ...(Number.isFinite(time.getTime()) ? { time } : {}) })
            }).filter(Boolean)
        }
        const result: Chapter[] = []
        const seen = new Set<string>()
        $('#chapter-list a[href*="/chapter-"]').each((_, element) => {
            const a = $(element), chapter = a.attr('href')?.split('/').pop() ?? ''
            if (!chapter || seen.has(chapter)) return
            seen.add(chapter)
            result.push(App.createChapter({ id: this.id(chapter), name: chapter.replace(/-/g, ' '), chapNum: chapterNumber(chapter.replace(/-/g, ' ')), langCode: 'en' }))
        })
        if (!result.length) throw new Error('No chapters found. Source markup may have changed.')
        return result
    }
    async getChapterDetails(id: string, chapter: string): Promise<ChapterDetails> {
        const $ = load(await this.fetch(`${this.getMangaShareUrl(id)}/${this.id(chapter)}`))
        const pages = $('.image-container img[data-number]').toArray().map(element => imageURL($(element).attr('data-src') || $(element).attr('src') || '', IMAGE_HOSTS))
        if (!pages.length) throw new Error('No reader pages found. Source markup or access may have changed.')
        return App.createChapterDetails({ id: chapter, mangaId: id, pages })
    }
}
