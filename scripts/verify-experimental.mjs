import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const identity = x => x
globalThis.App = Object.fromEntries(['Chapter', 'ChapterDetails', 'HomeSection', 'MangaInfo', 'PagedResults', 'PartialSourceManga', 'Request', 'SourceManga'].map(n => ['create' + n, identity]))
App.createRequestManager = () => ({
    getDefaultUserAgent: async () => 'Hardcover test',
    cookieStore: { getAllCookies: () => [{ name: 'mhub_access', domain: '.mangahub.io', value: 'fixture-session' }] },
    schedule: async () => { throw Error('Unexpected network request') }
})
const { Toonily } = process.env.TEST_BUNDLES ? require('../bundles/testing/0.8/Toonily/source.js').Sources : require('../.experimental-build/experimental/Toonily.js')
const { MangaHub } = process.env.TEST_BUNDLES ? require('../bundles/testing/0.8/MangaHub/source.js').Sources : require('../.experimental-build/experimental/MangaHub.js')
const { load } = require('cheerio')
const toon = new Toonily()
const card = '<div class="page-item-detail manga"><a href="https://toonily.com/serie/example/" title="Example"><img data-src="https://static.tnlycdn.com/cover.jpg"></a></div>'
assert.equal(toon.cards(load(card + card)).length, 1)
assert.equal(toon.cards(load(card.replace('https://toonily.com/', 'https://elsewhere.test/'))).length, 0)
assert.throws(() => toon.getMangaShareUrl('../bad'))
assert.equal((await toon.getCloudflareBypassRequestAsync()).url, 'https://toonily.com/')
toon.requestManager.schedule = async req => {
    assert.equal(req.cookies, undefined, 'Do not force website preferences/age cookies')
    if (req.url.endsWith('/ajax/chapters')) {
        assert.equal(req.method, 'POST')
        return { status: 200, data: '<li class="wp-manga-chapter"><a href="https://toonily.com/serie/example/chapter-2/">Chapter 2</a></li>' }
    }
    if (req.url.includes('chapter-2')) return { status: 200, data: '<div class="page-break"><img data-src="https://data.tnlycdn.com/1.jpg"></div><div class="page-break"><img src="https://data.tnlycdn.com/2.jpg"></div>' }
    return { status: 200, data: '<div class="post-title"><h1>Example <span>NEW</span></h1></div><div class="summary_image"><img src="https://static.tnlycdn.com/cover.jpg"></div><div class="summary__content">Example synopsis</div>' }
}
assert.equal((await toon.getMangaDetails('example')).mangaInfo.titles[0], 'Example')
assert.equal((await toon.getMangaDetails('example')).mangaInfo.desc, 'Example synopsis')
assert.throws(() => toon.cards(load(card.replace('static.tnlycdn.com', 'unrecognized.test'))), /media host/)
assert.equal((await toon.getChapters('example'))[0].chapNum, 2)
assert.equal((await toon.getChapterDetails('example', 'chapter-2')).pages.length, 2)
const inline = new Toonily()
let inlineRequests = 0
inline.requestManager.schedule = async req => {
    inlineRequests++
    assert.equal(req.method, 'GET')
    return { status: 200, data: '<li class="wp-manga-chapter"><a href="https://toonily.com/serie/example/chapter-1/">Chapter 1</a></li>' }
}
assert.equal((await inline.getChapters('example')).length, 1)
assert.equal(inlineRequests, 1)
toon.requestManager.schedule = async () => ({ status: 200, data: '<div>Reader missing</div>' })
await assert.rejects(toon.getChapterDetails('example', 'chapter-3'), /unavailable/)
for (const status of [403, 503]) {
    toon.requestManager.schedule = async () => ({ status, data: '' })
    await assert.rejects(toon.getMangaDetails('example'), /browser verification/)
}
toon.requestManager.schedule = async () => ({ status: 200, data: '<title>Just a moment</title>' })
await assert.rejects(toon.getMangaDetails('example'), /browser verification/)
let requests = 0
toon.requestManager.schedule = async () => { requests++; return { status: 429, data: '' } }
await assert.rejects(toon.getChapters('example'), /HTTP 429/)
await assert.rejects(toon.getChapters('example'), /Wait a minute/)
assert.equal(requests, 1)
const hub = new MangaHub()
hub.requestManager.schedule = async req => {
    assert.equal(req.url, 'https://api.mghcdn.com/graphql')
    assert.equal(req.headers['x-mhub-access'], 'fixture-session')
    const query = JSON.parse(req.data).query
    const row = { slug: 'example', title: 'Example', image: 'cover.jpg', chapters: [{ number: 1 }, { number: 2.5 }] }
    let data
    if (query.includes('search(')) data = { search: { rows: Array(30).fill(row) } }
    else if (query.includes('chapter(')) data = { chapter: { pages: JSON.stringify({ p: 'example/', i: ['1.jpg', '2.jpg'] }) } }
    else data = { manga: row }
    return { status: 200, data: JSON.stringify({ data }) }
}
const search = await hub.getSearchResults({ title: 'example' })
assert.equal(search.results.length, 1)
assert.deepEqual(search.metadata, { page: 2, query: 'example' })
assert.equal((await hub.getMangaDetails('example')).mangaInfo.image, 'https://thumb.mghcdn.com/cover.jpg')
assert.equal((await hub.getChapters('example'))[0].id, '2.5')
assert.deepEqual((await hub.getChapterDetails('example', '2.5')).pages, ['https://imgx.mghcdn.com/example/1.jpg', 'https://imgx.mghcdn.com/example/2.jpg'])
await assert.rejects(hub.getChapterDetails('example', '1){bad}'), /Invalid chapter/)
hub.requestManager.schedule = async () => ({ status: 200, data: JSON.stringify({ data: { chapter: { pages: '{"p":"../","i":["x.jpg"]}' } } }) })
await assert.rejects(hub.getChapterDetails('example', '1'), /Invalid page path/)
hub.requestManager.schedule = async () => ({ status: 200, data: '{}' })
await assert.rejects(hub.getMangaDetails('example'), /unavailable/)
hub.requestManager.schedule = async () => ({ status: 200, data: '{broken' })
await assert.rejects(hub.getMangaDetails('example'), /invalid JSON/)
hub.requestManager.schedule = async () => ({ status: 200, data: '{"errors":[{"message":"rate limit"}]}' })
await assert.rejects(hub.getMangaDetails('example'), /API rejected/)
await assert.rejects(hub.getMangaDetails('example'), /Wait a minute/)
const noSession = new MangaHub()
noSession.requestManager.cookieStore.getAllCookies = () => []
noSession.requestManager.schedule = async () => ({ status: 200, data: '<html>Public landing page</html>' })
await assert.rejects(noSession.getMangaDetails('example'), /session unavailable/)
const issued = new MangaHub()
issued.requestManager.cookieStore = undefined
let sessionRequests = 0
issued.requestManager.schedule = async req => {
    sessionRequests++
    if (req.url === 'https://mangahub.io/') return { status: 200, data: '<html></html>', headers: { 'Set-Cookie': 'mhub_access=fresh-fixture; Domain=.mangahub.io; Max-Age=60; Secure' } }
    assert.equal(req.headers['x-mhub-access'], 'fresh-fixture')
    return { status: 200, data: '{"data":{"manga":{"title":"Example","image":"cover.jpg"}}}' }
}
assert.equal((await issued.getMangaDetails('example')).mangaInfo.titles[0], 'Example')
assert.equal(sessionRequests, 2)
const expired = new MangaHub()
expired.requestManager.cookieStore.getAllCookies = () => [{ name: 'mhub_access', domain: '.mangahub.io', value: 'expired', expires: new Date(0) }]
expired.requestManager.schedule = async () => ({ status: 200, data: '<html></html>', headers: { 'set-cookie': 'mhub_access=expired; Max-Age=0' } })
await assert.rejects(expired.getMangaDetails('example'), /session unavailable/)
console.log('Experimental Toonily and MangaHub fixture tests passed. Live compatibility is NOT verified.')
