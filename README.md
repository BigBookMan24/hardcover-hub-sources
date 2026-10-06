# Hardcover Hub Sources

Hardcover Hub’s community source catalog, with a pink homepage and an Add to Hardcover button.

The main catalog includes **Atsu, MangaBuddy, MangaKatana, MangaHub, Toonily and Kagane**.

Add this URL in Hardcover:

`https://bigbookman24.github.io/hardcover-hub-sources/0.8/`

MangaHub and Toonily 0.1.0 passed sampled live iOS simulator reader tests.
**Kagane 0.1.0 is published for user testing but is not verified working in Hardcover:**
its API currently asks for browser verification. In Hardcover, open Settings →
Extensions → Kagane → Open Source Website, complete the website check, then tap
Use Session and retry. Verification may still fail; publishing is not a claim of
successful reading. See the [detailed validation results](experimental/README.md).

The existing `testing/0.8/` repository link remains supported with the same source
IDs and current builds, so existing test-source installations can update.

## Publish on a new GitHub repository

1. Create an empty repository (suggested name: `hardcover-hub-sources`).
2. Upload this folder's contents, including `.github/workflows/pages.yml`, to its
   `main` branch. Do not upload `node_modules` or `bundles`.
3. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
4. In **Actions**, run **Test and deploy extensions** (or push another commit).
5. Wait for both the build and deploy jobs to succeed.
6. Open `https://OWNER.github.io/REPOSITORY/0.8/` and tap **Add to Hardcover**,
   or enter that HTTPS URL in Hardcover's repository settings.

The workflow automatically uses the new GitHub owner/repository for installation
and source links. No reference to the old repository is used for installation.
For a custom domain, configure the domain in GitHub Pages and set repository
Actions variable `PAGES_BASE_URL` to your HTTPS site root (without `/0.8`).
An account-site repo named `OWNER.github.io` is supported too.

Git alternative to uploading files (run inside this folder, replacing the remote):

```sh
git init -b main
git add .
git commit -m "Prepare experimental Hardcover sources"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

## Local verification

Node 22.13+ and pnpm 11.9.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

Build a hosting-specific preview with:

```sh
GITHUB_REPOSITORY=OWNER/REPOSITORY pnpm test
```

Output: `bundles/0.8/` contains `versioning.json`, the homepage, and each
extension's `source.js` and icon. `bundles/index.html` redirects to `0.8/`.
Without hosting configuration, local builds deliberately disable installation.
Pull requests run tests but never deploy. Publishing uses GitHub's Pages artifact
deployment and does not need a personal access token or a `gh-pages` branch.

## Status and limits

- TypeScript, bundle validation, and synthetic parser/error tests pass.
- Captured public HTML tests previously verified MangaBuddy search, metadata,
  112 chapters and 18 page URLs; MangaKatana search, metadata, 700 chapters and
  60 page URLs. These were sampled titles, not full-site audits.
- MangaHub and Toonily passed sampled live runtime and image-decoding tests; physical iPhone verification and sustained use remain untested. Kagane is blocked by browser verification. These results do not certify the other sources.
- MangaKatana has a history of throttling. Both adapters are limited to one
  request per second and pause new requests for a minute after HTTP 429.
- Site changes, new CDN hosts, or anti-bot challenges may require updates.
- These are mature third-party catalogs, not child-safe sources. MangaBuddy
  excludes marked adult/blurred cards; this is not a comprehensive content audit.
- Toonily, MangaHub and Kagane are included in the main catalog and the compatible test catalog. Toonily is rated MATURE; MangaHub excludes explicitly adult catalog cards, and Kagane requests English Safe/Suggestive results. App content settings are not changed.
- October 2026 source update: Toonily was rebuilt from current public markup; MangaHub uses HTML catalog pages plus the website’s current encrypted chapter manifest protocol; Kagane uses its v2 catalog and normal site-issued reader sessions. See the [validation notes](experimental/README.md) before testing.

Use only material you are authorized to access. Site logos and content remain
their owners' property. Preserve `LICENSE` and `THIRD_PARTY_NOTICES.md` when
redistributing this code. This repository is not affiliated with the source sites.

GitHub setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

October 6 follow-up (0.1.1): serialize source requests, respect Retry-After cooldowns, and slow MangaHub’s request schedule to prevent request bursts. Toonily’s catalog rating is Mature. Kagane still requires successful in-app verification before reading can be confirmed.
