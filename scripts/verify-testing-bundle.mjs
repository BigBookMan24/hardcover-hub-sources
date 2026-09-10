import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const root = 'bundles/testing/0.8'
const manifest = JSON.parse(await readFile(`${root}/versioning.json`, 'utf8'))
assert.deepEqual(manifest.sources.map(s => s.id).sort(), ['MangaHub', 'Toonily'])
for (const source of manifest.sources) {
    assert.equal(source.contentRating, source.id === 'Toonily' ? 'ADULT' : 'MATURE')
    assert(source.intents & 16, 'Missing browser verification capability')
    await access(`${root}/${source.id}/includes/icon.png`)
    const exports = require(`../${root}/${source.id}/source.js`).Sources
    assert.equal(typeof exports[source.id], 'function')
    assert.equal(typeof exports[source.id].prototype.getChapterDetails, 'function')
}
const html = await readFile(`${root}/index.html`, 'utf8')
assert(html.includes('TEST BUILDS'))
if (process.env.GITHUB_REPOSITORY || process.env.PAGES_BASE_URL) assert(html.includes('%2Ftesting%2F0.8'))
const stable = JSON.parse(await readFile('bundles/0.8/versioning.json', 'utf8'))
assert.deepEqual(stable.sources.map(s => s.id).sort(), ['Atsu', 'MangaBuddy', 'MangaKatana'])
console.log('Test catalog bundles verified; the main catalog remains isolated.')
execFileSync(process.execPath, ['scripts/verify-experimental.mjs'], { stdio: 'inherit', env: { ...process.env, TEST_BUNDLES: '1' } })
