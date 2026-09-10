# Hardcover Hub Sources

Hardcover Hub’s community source catalog, with a pink homepage and an Add to Hardcover button.

Includes Atsu plus the two newly created **experimental** Hardcover 0.8 sources: MangaBuddy and MangaKatana. Toonily and MangaHub have a separate opt-in test catalog generated at `testing/0.8/`; they are not included in the main catalog. See [their status and test instructions](experimental/README.md).
This package is ready for hosting setup, not a claim of on-device certification.

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
- Hardcover installation, actual image display, and sustained use are untested.
- MangaKatana has a history of throttling. Both adapters are limited to one
  request per second and pause new requests for a minute after HTTP 429.
- Site changes, new CDN hosts, or anti-bot challenges may require updates.
- These are mature third-party catalogs, not child-safe sources. MangaBuddy
  excludes marked adult/blurred cards; this is not a comprehensive content audit.
- Toonily and MangaHub are tested separately and published only in the opt-in test catalog. No family-mode or unrestricted-content variant is published.

Use only material you are authorized to access. Site logos and content remain
their owners' property. Preserve `LICENSE` and `THIRD_PARTY_NOTICES.md` when
redistributing this code. This repository is not affiliated with the source sites.

GitHub setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
