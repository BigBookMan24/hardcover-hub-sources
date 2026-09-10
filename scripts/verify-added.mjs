import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const identity = value => value
globalThis.App = Object.fromEntries(['Chapter', 'ChapterDetails', 'HomeSection', 'MangaInfo', 'PagedResults', 'PartialSourceManga', 'Request', 'SourceManga'].map(name => ['create' + name, identity]))
App.createRequestManager = () => ({ getDefaultUserAgent: async () => 'Hardcover extension test', schedule: async () => { throw Error('Unexpected request') } })
const { MangaBuddy } = require('../bundles/0.8/MangaBuddy/source.js').Sources
const { MangaKatana } = require('../bundles/0.8/MangaKatana/source.js').Sources
const { load } = require('cheerio')
const buddy = new MangaBuddy(), katana = new MangaKatana()
assert.equal(buddy.cards(load('<a href="/series/test.ABC" title="Test"><img data-src="https://cdn1.love4awalk.xyz/t.webp"></a>')).length, 1)
assert.equal(buddy.cards(load('<a href="/series/test.ABC" title="Test"><img class="nsfw-blur" data-src="https://cdn1.love4awalk.xyz/t.webp"></a>')).length, 0)
assert.throws(() => buddy.getMangaShareUrl('../bad'))
assert.throws(() => katana.getMangaShareUrl('https://elsewhere.test'))
katana.requestManager.schedule = async () => ({ status: 200, data: "var thzq=['https://i1.mangakatana.com/test/1.jpg','https://i1.mangakatana.com/test/2.jpg',];" })
assert.equal((await katana.getChapterDetails('test.1', 'c1')).pages.length, 2)
const blocked = new MangaKatana()
let requests = 0
blocked.requestManager.schedule = async () => { requests++; return { status: 429, data: '' } }
await assert.rejects(blocked.getMangaDetails('test.1'), /HTTP 429/)
await assert.rejects(blocked.getMangaDetails('test.1'), /Wait a minute/)
assert.equal(requests, 1)
const changed = new MangaBuddy()
changed.requestManager.schedule = async () => ({ status: 200, data: '<div class="image-container"><img data-number="1" src="https://unexpected.test/1.jpg"></div>' })
await assert.rejects(changed.getChapterDetails('test.1', 'chapter-1'), /Image host changed/)
console.log('Added-source regression tests passed: cards, adult marker exclusion, ID validation, reader arrays, 429 backoff, CDN restriction.')

// Optional local HTML audit: no copyrighted chapter images are stored in the repo.
if (process.argv.includes('--captured')) {
    const file = name => readFile('/tmp/hc-' + name, 'utf8')
    for (const [Class, name, title, chapter, detail, reader, search] of [
        [MangaBuddy, 'MangaBuddy', 'diamond-no-kouzai.ZDNQSQ', 'chapter-109', 'buddy-detail.html', 'buddy-reader.html', 'buddy-search.html'],
        [MangaKatana, 'MangaKatana', 'naruto.1205', 'c1', 'katana-detail.html', 'katana-reader.html', 'katana-search.html']
    ]) {
        const source = new Class()
        source.requestManager.schedule = async request => ({ status: 200, data: await file(request.url.includes('get-chapter-list') ? 'buddy-chapters.json' : request.url.endsWith('/' + chapter) ? reader : detail) })
        const cards = source.cards(load(await file(search)))
        const info = await source.getMangaDetails(title)
        const chapters = await source.getChapters(title)
        const pages = await source.getChapterDetails(title, chapter)
        assert(cards.length > 0); assert(info.mangaInfo.titles[0]); assert(chapters.length > 20); assert(pages.pages.length > 0)
        console.log(`${name}: ${cards.length} search cards, ${chapters.length} chapters, ${pages.pages.length} reader URLs; metadata OK.`)
    }
}
