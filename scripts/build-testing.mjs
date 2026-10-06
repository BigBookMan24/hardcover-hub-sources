import { cp, mkdir, mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
const require = createRequire(import.meta.url)
const root = process.cwd()
// Stage under this package so all imports resolve through its pinned node_modules.
const stage = await mkdtemp(path.join(root, '.testing-stage-'))
try {
    await symlink(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir')
    await cp(path.join(root, 'tsconfig.json'), path.join(stage, 'tsconfig.json'))
    for (const dir of ['experimental', 'assets']) await cp(path.join(root, dir), path.join(stage, dir), { recursive: true })
    await cp(path.join(root, 'src'), path.join(stage, 'src'), { recursive: true })
    for (const name of ['Atsu', 'MangaBuddy', 'MangaKatana']) await rm(path.join(stage, 'src', name), { recursive: true })
    const pkg = JSON.parse(await readFile('package.json', 'utf8'))
    pkg.repositoryName = 'Hardcover Hub — Test Sources'
    pkg.description = 'TEST BUILDS: Toonily, MangaHub and Kagane. Expect failures; browser verification may be required. Kagane reading is not yet verified in Hardcover.'
    await writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2))
    for (const name of ['Toonily', 'MangaHub', 'Kagane']) {
        const dir = path.join(stage, 'src', name)
        await mkdir(path.join(dir, 'includes'), { recursive: true })
        await cp(path.join(root, `experimental/icons/${name}.png`), path.join(dir, 'includes/icon.png'))
        const sourcePath = path.join(dir, `${name}.ts`)
        const sourceCode = await readFile(sourcePath, 'utf8')
        await writeFile(sourcePath, sourceCode + `\n${name}Info.name += ' (Testing)'\n`)
    }
    const tool = path.join(path.dirname(require.resolve('@paperback/toolchain/package.json')), 'bin/run')
    await mkdir(path.join(stage, 'bundles'))
    execFileSync(process.execPath, [tool, 'bundle', '--folder=0.8'], { cwd: stage, stdio: 'inherit' })
    const slug = process.env.GITHUB_REPOSITORY
    const owner = slug?.split('/')[0]
    const repo = slug?.split('/')[1]
    const base = process.env.PAGES_BASE_URL || (slug ? `https://${owner.toLowerCase()}.github.io${repo.toLowerCase() === owner.toLowerCase() + '.github.io' ? '' : '/' + repo}` : '')
    execFileSync(process.execPath, [path.join(root, 'scripts/customize-homepage.mjs')], {
        cwd: stage, stdio: 'inherit', env: { ...process.env, PAGES_BASE_URL: base ? base.replace(/\/$/, '') + '/testing' : '' }
    })
    await mkdir(path.join(root, 'bundles/testing'), { recursive: true })
    await cp(path.join(stage, 'bundles'), path.join(root, 'bundles/testing'), { recursive: true })
} finally {
    // This exact directory was freshly created above and contains only build staging files.
    await rm(stage, { recursive: true, force: true })
}
console.log('Built separate test catalog at bundles/testing/0.8; existing test-catalog install links remain supported.')
