import { readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('bundles/0.8')
await copyFile('assets/hardcover-app-icon.jpg', path.join(root, 'hardcover-app-icon.jpg'))
const manifest = JSON.parse(await readFile(path.join(root, 'versioning.json'), 'utf8'))
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'))
const slug = process.env.GITHUB_REPOSITORY
if (slug && !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(slug)) throw new Error('Invalid GITHUB_REPOSITORY')
const [owner, repo] = (slug || '').split('/')
const defaultBase = slug ? `https://${owner.toLowerCase()}.github.io${repo.toLowerCase() === owner.toLowerCase() + '.github.io' ? '' : '/' + repo}` : undefined
const base = process.env.PAGES_BASE_URL || defaultBase
if (base && new URL(base).protocol !== 'https:') throw new Error('PAGES_BASE_URL must use HTTPS')
const repositoryURL = base ? base.replace(/\/$/, '') + '/0.8' : ''
const displayName = packageInfo.repositoryName
const deepLink = `hardcover://addRepo?displayName=${encodeURIComponent(displayName)}&url=${encodeURIComponent(repositoryURL)}`

const escapeHTML = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const sourceItems = manifest.sources
    .map((source) => `<li>${escapeHTML(source.name)}</li>`)
    .join('')

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#c52c79">
  <link rel="icon" href="./hardcover-app-icon.jpg">
  <title>${escapeHTML(displayName)}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --accent: #c52c79;
      --sage: #963363;
      --paper: #fff1f7;
      --ink: #382033;
      --muted: #795769;
      --card: rgba(255, 255, 255, 0.82);
      --line: rgba(151, 45, 102, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, rgba(247, 117, 182, 0.28), transparent 34rem),
        linear-gradient(145deg, var(--paper), #fce3f1);
    }
    main {
      width: min(760px, calc(100% - 32px));
      margin: 0 auto;
      padding: 64px 0;
    }
    .hero, .sources {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 18px 55px rgba(130, 37, 85, 0.1);
      backdrop-filter: blur(18px);
    }
    .hero { padding: clamp(28px, 7vw, 56px); text-align: center; }
    .mark {
      display: grid;
      place-items: center;
      width: 76px;
      height: 76px;
      margin: 0 auto 22px;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 12px 28px rgba(197, 44, 121, 0.24);
    }
    .mark img { width: 100%; height: 100%; display: block; object-fit: cover; }
    h1 { margin: 0; font-size: clamp(2rem, 7vw, 3.5rem); letter-spacing: -0.04em; }
    .lead {
      max-width: 570px;
      margin: 16px auto 28px;
      color: var(--muted);
      font-size: 1.08rem;
      line-height: 1.6;
    }
    .add {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 52px;
      padding: 0 24px;
      color: white;
      background: var(--accent);
      border-radius: 14px;
      font-weight: 750;
      text-decoration: none;
      box-shadow: 0 10px 22px rgba(197, 44, 121, 0.25);
    }
    .add:hover { background: #a82063; transform: translateY(-1px); }
    a:focus-visible { outline: 3px solid var(--sage); outline-offset: 5px; }
    .review { margin: 16px 0 0; color: var(--muted); font-size: 0.9rem; }
    .base {
      display: block;
      margin: 24px auto 0;
      padding: 12px 14px;
      overflow-wrap: anywhere;
      color: var(--sage);
      background: rgba(197, 44, 121, 0.08);
      border-radius: 12px;
      font: 0.86rem ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .sources { margin-top: 20px; padding: 28px; }
    .sources h2 { margin: 0 0 18px; font-size: 1.2rem; }
    ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.44);
    }
    footer { padding: 22px 8px 0; text-align: center; color: var(--muted); font-size: 0.85rem; }
    footer a { color: var(--sage); }
    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #25131f;
        --ink: #fff0f7;
        --muted: #d5afc4;
        --sage: #f2a1cc;
        --card: rgba(55, 27, 44, 0.90);
        --line: rgba(255, 255, 255, 0.1);
      }
      body { background: radial-gradient(circle at top right, #662544, transparent 34rem), var(--paper); }
      li { background: rgba(255, 255, 255, 0.035); }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="mark">
        <img src="./hardcover-app-icon.jpg" alt="Hardcover Reader panda app icon" width="76" height="76">
      </div>
      <h1>${escapeHTML(displayName)}</h1>
      <p class="lead">${escapeHTML(packageInfo.description)}</p>
      ${repositoryURL ? `<a class="add" href="${escapeHTML(deepLink)}">Add to Hardcover</a>` : '<p>Local preview — build with GITHUB_REPOSITORY or PAGES_BASE_URL to enable installation.</p>'}
      <p class="review">Hardcover will ask you to review and trust the repository before adding it.</p>
      <code class="base">${escapeHTML(repositoryURL)}</code>
    </section>
    <section class="sources">
      <h2>Available sources</h2>
      <ul>${sourceItems}</ul>
    </section>
    <footer>
      Hardcover extension catalog ·
      ${slug ? `<a href="https://github.com/${escapeHTML(slug)}">View source on GitHub</a>` : 'Unpublished local build'}
      <p>Independent community repository · Icon belongs to <a href="https://apps.apple.com/us/app/hardcover-reader/id6802157187">Hardcover Reader</a>.</p>
    </footer>
  </main>
</body>
</html>
`

await writeFile(path.join(root, 'index.html'), html)
await writeFile(path.resolve('bundles/index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=./0.8/">
  <link rel="canonical" href="${repositoryURL}/">
  <title>${escapeHTML(displayName)}</title>
</head>
<body>
  <p><a href="./0.8/">Open ${escapeHTML(displayName)}</a></p>
</body>
</html>
`)
console.log('Generated Hardcover repository homepage.')
