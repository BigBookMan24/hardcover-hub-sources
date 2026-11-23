import assert from 'node:assert/strict'
import { createCipheriv } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const identity = value => value
globalThis.App = Object.fromEntries(['Chapter', 'ChapterDetails', 'HomeSection', 'MangaInfo', 'PagedResults', 'PartialSourceManga', 'Request', 'SourceManga', 'Tag', 'TagSection'].map(name => ['create' + name, identity]))
App.createRequestManager = () => ({ getDefaultUserAgent: async () => 'Hardcover test', schedule: async () => { throw Error('Unexpected request') } })
const source = name => process.env.TEST_BUNDLES
    ? require(`../bundles/${process.env.TEST_BUNDLES === 'main' ? '' : 'testing/'}0.8/${name}/source.js`).Sources[name]
    : require(`../.experimental-build/experimental/${name}.js`)[name]
const Toonily = source('Toonily'), MangaHub = source('MangaHub'), Kagane = source('Kagane')
const { load } = require('cheerio')
const response = data => ({ status: 200, data: typeof data === 'string' ? data : JSON.stringify(data) })

// Structural fixtures follow public HTML inspected on 2026-10-06. No live chapter art/tokens are stored.
const toonCard = '<div class="page-item-detail manga"><div class="item-thumb"><a href="https://toonily.com/serie/example/"><img src="https://static.tnlycdn.com/cover.jpg"></a></div><div class="post-title"><h3><a href="https://toonily.com/serie/example/">Example</a></h3></div></div>'
const toonTitle = '<div class="post-title"><h1>Example <span class="manga-title-badges">TOP</span></h1></div><div class="summary_image"><img src="https://static.tnlycdn.com/cover.jpg"></div><div class="summary__content">A synopsis</div><div class="post-content_item"><div class="summary-heading">Writer(s)</div><div class="summary-content">An Author</div></div><div id="tab-chapter-listing"><li class="wp-manga-chapter"><a href="https://toonily.com/serie/example/chapter-2.5/">Chapter 2.5 — Extra</a></li><li class="wp-manga-chapter"><a href="https://toonily.com/serie/example/chapter-1/">Chapter 1</a></li></div>'
const toon = new Toonily(), toonRequests = []
toon.requestManager.schedule = async req => {
    toonRequests.push(req)
    assert.equal(req.cookies, undefined, 'Do not inject content or age preference cookies')
    if (req.url.includes('/search/')) return response(toonCard + toonCard + '<a rel="next" href="https://toonily.com/page/2/?s=example">Next</a>')
    if (req.url.includes('/page/2/')) return response('<h1>0 RESULTS</h1>')
    if (req.url.includes('/chapter-')) return response('<div class="reading-content"><div class="page-break"><img class="wp-manga-chapter-img" src="https://data.tnlycdn.com/1.jpg"></div><div class="page-break"><img class="wp-manga-chapter-img" data-src="https://data.tnlycdn.com/2.jpg" src="data:image/png;base64,placeholder"></div></div>')
    return response(toonTitle)
}
const toonSearch = await toon.getSearchResults({ title: 'example' })
assert.equal(toonSearch.results.length, 1)
assert.equal((await toon.getSearchResults({ title: 'example' }, toonSearch.metadata)).metadata, undefined)
await toon.getSearchResults({ title: 'different' }, toonSearch.metadata)
assert.equal(toonRequests.at(-1).url, 'https://toonily.com/search/different', 'New queries reset pagination')
assert.equal((await toon.getMangaDetails('example')).mangaInfo.titles[0], 'Example')
assert.equal((await toon.getMangaDetails('example')).mangaInfo.author, 'An Author')
assert.deepEqual((await toon.getChapters('example')).map(c => c.chapNum), [2.5, 1])
assert.deepEqual((await toon.getChapterDetails('example', 'chapter-2.5')).pages, ['https://data.tnlycdn.com/1.jpg', 'https://data.tnlycdn.com/2.jpg'])
assert.equal(toonRequests.filter(r => r.url === toon.getMangaShareUrl('example')).length, 1, 'Reuse title HTML for details and chapters')
assert.equal(toon.cards(load(toonCard.replaceAll('https://toonily.com', 'https://other.test'))).length, 0)
assert.throws(() => toon.cards(load(toonCard.replace('static.tnlycdn.com', 'static.tnlycdn.com.evil.test'))), /image host/)

// All search controls are passed to the site's form endpoint, including text fields.
const filteredToon = new Toonily(), filterRequests = []
const filterForm = '<form class="search-advanced-form"><label><input name="genre[]" value="action">Action</label><label><input name="status[]" value="end">Completed</label><label><input name="adult" value="0">Family Friendly</label><label><input name="adult" value="1">Mature Only</label></form>'
filteredToon.requestManager.schedule = async req => {
    filterRequests.push(req)
    if (req.url.endsWith('/search/beginning')) return response(filterForm)
    return response(toonCard + '<a rel="next" href="https://toonily.com/page/2/?genre%5B%5D=action">Next</a>')
}
const groups = await filteredToon.getSearchTags()
assert.equal(groups.length, 7)
assert.equal(groups.find(g => g.id === 'genres').tags[0].id, 'genre:action')
assert.equal(groups.find(g => g.id === 'sort:single').tags.length, 7)
const query = { title: 'test & title', includedTags: ['genre:action', 'genre:fantasy', 'status:end', 'adult:0', 'op:1', 'sort:rating', 'author:A & B', 'artist:An Artist'].map(id => ({id})) }
const filteredPage = await filteredToon.getSearchResults(query)
const submitted = new URL(filterRequests.at(-1).url).searchParams
assert.deepEqual(submitted.getAll('genre[]'), ['action', 'fantasy'])
assert.equal(submitted.get('status[]'), 'end')
assert.equal(submitted.get('author'), 'A & B')
assert.equal(submitted.get('artist'), 'An Artist')
assert.equal(submitted.get('s'), 'test & title')
assert.equal(submitted.get('m_orderby'), 'rating')
assert.equal(submitted.get('adult'), '0')
assert.equal(submitted.get('op'), '1')
await filteredToon.getSearchResults(query, filteredPage.metadata)
assert(filterRequests.at(-1).url.includes('/page/2/'))
await filteredToon.getSearchResults({ ...query, includedTags: [{id:'genre:comedy'}] }, filteredPage.metadata)
assert(!filterRequests.at(-1).url.includes('/page/2/'), 'Changed filters reset pagination')
assert.equal((await toon.getMangaDetails('example')).mangaInfo.hardcoverRequiresRMode, false)
const restrictedToon = new Toonily()
restrictedToon.requestManager.schedule = async () => response('<body class="adult-content">' + toonTitle + '</body>')
assert.equal((await restrictedToon.getMangaDetails('example')).mangaInfo.hardcoverRequiresRMode, true)

const hubCard = '<div class="media-manga media"><div class="media-left"><img class="manga-thumb" src="https://thumb.mghcdn.com/cover.jpg"></div><h4 class="media-heading"><a href="https://mangahub.io/manga/example">Example</a></h4></div>'
const hubTitle = '<div id="mangadetail"><h1>Example<a>Hot</a><small>Alternate; Example</small></h1><img class="manga-thumb" src="https://thumb.mghcdn.com/cover.jpg"><div><span>Author</span><span>Writer</span></div><div id="chapters-tab"><div class="tab-pane active"><li class="list-group-item"><a href="https://mangahub.io/chapter/example/chapter-2695288">#2.5 - Extra<small>yesterday</small></a><a href="https://mangahub.io/chapter/example/chapter-99999">Alternate</a></li></div><div class="tab-pane" aria-hidden="true"><li class="list-group-item"><a href="https://mangahub.io/chapter/example/chapter-1">#1</a></li></div><div id="chapters-tab-pane-999">Synopsis</div></div></div>'
const hub = new MangaHub(), hubRequests = []
const key = Buffer.alloc(32, 19), iv = Buffer.alloc(12, 7)
const cipher = createCipheriv('aes-256-gcm', key, iv)
const manifest = { p: 'example/', i: Array.from({ length: 51 }, (_, i) => `${i + 1}.webp?x=fixture`) }
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(manifest)), cipher.final()])
const envelope = ['enc', 'v1', 'fixture-key', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':')
let hubEnvelope = envelope, hubAccess = 'fixture-access', expiredReplies = 0
hub.requestManager.schedule = async req => {
    hubRequests.push(req)
    if (req.url === 'https://mangahub.io/') return { ...response('<html>Session</html>'), headers: { 'set-cookie': 'mhub_access=fixture-access; Path=/; Max-Age=300' } }
    if (req.url.endsWith('/api/chapter-crypto')) return response({ keyId: 'fixture-key', key: key.toString('base64url'), expiresAt: Date.now() + 300000 })
    if (req.url === 'https://api.mghcdn.com/graphql') {
        assert.equal(req.headers['x-mhub-access'], hubAccess)
        assert(JSON.parse(req.data).query.includes('number:2.5'), 'Use displayed chapter numbers, not database row IDs')
        if (expiredReplies-- > 0) return response({ errors: [{ message: 'Chapter encryption unavailable' }] })
        return response({ data: { chapter: { pages: hubEnvelope } } })
    }
    if (req.url.includes('/search')) return response('<input id="q">' + hubCard + '<ul class="pager"><li class="next"><a href="/search?page=2">Next →</a></li></ul>')
    if (req.url.includes('/chapter/')) return response('<div id="mangareader"><img src="https://imgx.mghcdn.com/example/1.webp?x=fixture"><div class="hidden"><img src="https://imgx.mghcdn.com/example/2.webp?x=fixture"></div><img src="https://ad.test/banner.jpg"></div>')
    if (req.url.endsWith('/manga/other')) {
        hubAccess = 'fixture-access-2'
        return { ...response(hubTitle), headers: { 'set-cookie': `mhub_access=${hubAccess}; Path=/; Max-Age=300` } }
    }
    return response(hubTitle)
}
const hubSearch = await hub.getSearchResults({ title: 'an "example" & more' })
assert.equal(hubSearch.results.length, 1)
assert(hubRequests[0].url.includes('an%20%22example%22%20%26%20more'))
assert.equal(hubSearch.metadata.next, 'https://mangahub.io/search?page=2')
assert.equal(hub.cards(load(hubCard.replace('</h4>', '</h4><a href="/genre/pornographic">Adult</a>'))).length, 0)
assert.deepEqual((await hub.getMangaDetails('example')).mangaInfo.titles, ['Example', 'Alternate'])
assert.equal((await hub.getMangaDetails('example')).mangaInfo.author, 'Writer')
assert.deepEqual((await hub.getChapters('example')).map(c => c.id), ['2.5', '1'], 'Hidden tabs included, alternate copies excluded; existing numeric IDs retained')
assert.equal(hubRequests.filter(r => r.url.endsWith('/manga/example')).length, 1)
assert.deepEqual((await hub.getChapterDetails('example', '2.5')).pages, manifest.i.map(file => 'https://imgx.mghcdn.com/example/' + file), 'Read all 51 pages, never the six-page HTML preview')
await hub.getMangaDetails('other')
await hub.getChapterDetails('example', '2.5')
assert.equal(hubRequests.filter(req => req.url.endsWith('/api/chapter-crypto')).length, 2, 'A new website session must not reuse an old chapter key')
expiredReplies = 1
await hub.getChapterDetails('example', '2.5')
assert.equal(hubRequests.filter(req => req.url.endsWith('/api/chapter-crypto')).length, 3, 'Refresh an expired chapter key once, like the website reader')
expiredReplies = 2
const beforeExpired = hubRequests.filter(req => req.url.endsWith('/graphql')).length
await assert.rejects(hub.getChapterDetails('example', '2.5'), /after refresh/)
assert.equal(hubRequests.filter(req => req.url.endsWith('/graphql')).length - beforeExpired, 2, 'Do not loop on session errors')
hubEnvelope = envelope.slice(0, -5) + 'AAAAA'
await assert.rejects(hub.getChapterDetails('example', '2.5'), /tag|auth|invalid/i, 'Reject modified ciphertext')
hubEnvelope = envelope
await assert.rejects(hub.getChapterDetails('example', '1/../../bad'), /Invalid chapter/)

const kagane = new Kagane(), kaganeRequests = []
const series = { title: 'Example', series_covers: [{ image_id: 'cover-id' }], upload_status: 'ONGOING', description: '<p>Synopsis</p>', series_staff: [{ name: 'Writer', role: 'Author' }], series_books: [{ book_id: 'book-1', sort_no: 1, chapter_no: '1', title: 'Chapter 1' }, { book_id: 'book-2', sort_no: 2, chapter_no: '1.5', title: 'Extra' }] }
const reader = { access_token: 'fixture+/=', cache_url: 'https://yuzuki.kagane.to', manifest: { pages: [{ page_no: 2, page_id: 'page-2', ext: 'webp' }, { page_no: 1, page_id: 'page-1', ext: 'jpg' }] } }
kagane.requestManager.schedule = async req => {
    kaganeRequests.push(req)
    if (req.url.includes('/search/series')) {
        assert.equal(req.method, 'POST')
        const body = JSON.parse(req.data)
        assert.deepEqual(body.content_rating, ['Safe', 'Suggestive'])
        assert.deepEqual(body.content_lang, ['en'])
        return response({ content: [{ series_id: 'series-1', title: 'Example', cover_image_id: 'cover-id' }], last: false })
    }
    if (req.url.endsWith('/series/series-1')) return response(series)
    if (req.url.endsWith('/api/integrity')) return response({ token: 'fixture-integrity', exp: Date.now() / 1000 + 60 })
    if (req.url.includes('/books/')) {
        assert.equal(req.method, 'POST')
        assert.equal(req.headers['x-integrity-token'], 'fixture-integrity')
        return response(reader)
    }
    assert.equal(req.url, 'https://kagane.moe/')
    return response('<html>Session</html>')
}
const kaganeSearch = await kagane.getSearchResults({ title: 'example' })
assert.deepEqual(kaganeSearch.metadata, { query: 'example', page: 1 })
await kagane.getSearchResults({ title: 'different' }, kaganeSearch.metadata)
assert(kaganeRequests.at(-1).url.includes('page=0'))
assert.equal((await kagane.getMangaDetails('series-1')).mangaInfo.author, 'Writer')
assert.deepEqual((await kagane.getChapters('series-1')).map(c => c.chapNum), [1.5, 1])
const pages = await kagane.getChapterDetails('series-1', 'book-1')
assert.deepEqual(pages.pages, ['https://yuzuki.kagane.to/api/v2/books/page/book-1/page-1.jpg?token=fixture%2B%2F%3D', 'https://yuzuki.kagane.to/api/v2/books/page/book-1/page-2.webp?token=fixture%2B%2F%3D'])
await kagane.getChapterDetails('series-1', 'book-2')
assert.equal(kaganeRequests.filter(r => r.url.endsWith('/api/integrity')).length, 1)
reader.cache_url = 'https://yuzuki.kagane.to.evil.test'
await assert.rejects(kagane.getChapterDetails('series-1', 'book-1'), /image server changed/)
reader.cache_url = 'https://yuzuki.kagane.to'
reader.manifest.pages[1].page_no = 2
await assert.rejects(kagane.getChapterDetails('series-1', 'book-1'), /invalid page order/)

for (const Class of [Toonily, MangaHub, Kagane]) {
    assert.throws(() => new Class().getMangaShareUrl('../invalid'))
    const blocked = new Class(); let calls = 0
    blocked.requestManager.schedule = async () => { calls++; return { status: 429, data: '' } }
    await assert.rejects(blocked.getSearchResults({ title: 'example' }), /429/)
    await assert.rejects(blocked.getSearchResults({ title: 'different' }), /Wait \d+ seconds/)
    assert.equal(calls, 1)
    const challenged = new Class()
    challenged.requestManager.schedule = async () => ({ status: 403, data: '<title>Just a moment...</title>' })
    await assert.rejects(challenged.getSearchResults({ title: 'example' }), /browser verification/)
    assert.equal((await challenged.getCloudflareBypassRequestAsync()).url, challenged.domain + '/')
    const malformed = new Class()
    malformed.requestManager.schedule = async () => response('<html>Unexpected content</html>')
    await assert.rejects(malformed.getMangaDetails('example'), /unavailable/)
}
// Queued operations must not escape the cooldown after an earlier request is rejected.
const queued = new Toonily(); let queuedCalls = 0
queued.requestManager.schedule = async () => { queuedCalls++; return { status: 429, headers: { 'Retry-After': '120' }, data: '' } }
const queuedResults = await Promise.allSettled(['one', 'two', 'three'].map(title => queued.getSearchResults({ title })))
assert.equal(queuedCalls, 1)
assert(queuedResults.every(result => result.status === 'rejected' && /Wait 120 seconds/.test(result.reason.message)))
const serialized = new Toonily(); let active = 0, maxActive = 0
serialized.requestManager.schedule = async () => {
    active++; maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 5)); active--
    return response(toonTitle)
}
await Promise.all(['one', 'two', 'three'].map(id => serialized.getMangaDetails(id)))
assert.equal(maxActive, 1, 'Different requests must not reach the native scheduler together')

// Concurrent title/chapter loading shares one request. Failures remain retryable.
const concurrent = new Toonily(); let calls = 0
concurrent.requestManager.schedule = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return response(toonTitle) }
await Promise.all([concurrent.getMangaDetails('example'), concurrent.getChapters('example')])
assert.equal(calls, 1)
const retry = new Toonily(); let attempts = 0
retry.requestManager.schedule = async () => ++attempts === 1 ? { status: 503, data: '' } : response(toonTitle)
await assert.rejects(retry.getMangaDetails('example'), /503/)
assert.equal((await retry.getMangaDetails('example')).mangaInfo.titles[0], 'Example')

if (process.argv.includes('--captured')) {
    const live = new Toonily()
    live.requestManager.schedule = async () => response(await readFile('/tmp/toon-live.html', 'utf8'))
    assert.equal((await live.getMangaDetails('the-beginning-after-the-end-54f5cb7c')).mangaInfo.author, 'TurtleMe')
    assert((await live.getChapters('the-beginning-after-the-end-54f5cb7c')).length > 250)
    console.log('Captured Toonily HTTP response: title, author and 250+ chapter links parsed.')
}
console.log('MangaHub, fresh Toonily and Kagane parser/protocol/error tests passed. Live app verification is required separately.')
