import assert from 'node:assert/strict'
import { readFile, access, readdir } from 'node:fs/promises'
const root = 'bundles/0.8'
const manifest = JSON.parse(await readFile(`${root}/versioning.json`, 'utf8'))
const expected = ['Atsu', 'MangaBuddy', 'MangaKatana']
assert.deepEqual(manifest.sources.map(s => s.id).sort(), expected)
const directories = (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()
assert.deepEqual(directories, expected, 'Unexpected source bundles must not be published')
assert.equal(manifest.builtWith.types, '0.8.7')
for (const source of manifest.sources) {
    assert(['MATURE', 'EVERYONE'].includes(source.contentRating))
    await access(`${root}/${source.id}/source.js`)
    await access(`${root}/${source.id}/includes/${source.icon}`)
}
const html = await readFile(`${root}/index.html`, 'utf8')
await access(`${root}/hardcover-app-icon.jpg`)
assert(html.includes('alt="Hardcover Reader panda app icon"'))
assert(!html.includes('big-man25.github.io'), 'Stale upstream installation link')
assert(!html.includes('paperback://'), 'Wrong application deep link')
if (process.env.GITHUB_REPOSITORY || process.env.PAGES_BASE_URL) {
    assert(html.includes('hardcover://addRepo?'), 'Missing install link')
} else {
    assert(!html.includes('href="hardcover://'), 'Unconfigured local build must not install another repository')
}
console.log('Verified three-source hosting artifacts.')
