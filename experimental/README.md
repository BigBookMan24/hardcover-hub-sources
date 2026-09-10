# Development-only sources

These are **installable test builds, not verified Hardcover releases**.
They are outside `src/` so the normal bundle and install page still contain only
Atsu, MangaBuddy, and MangaKatana. Do not promote them based solely on fixture tests.

Build a separate testing repository using:

```sh
GITHUB_REPOSITORY=BigBookMan24/hardcover-hub-sources pnpm run build:testing
```

The generated catalog is `bundles/testing/0.8/`, with separate IDs, icons,
accurate source ratings and the browser-verification capability. GitHub Actions
builds this beside the main catalog. After Pages is actually deployed, its URL
will be `https://bigbookman24.github.io/hardcover-hub-sources/testing/0.8/`.
This URL is NOT live until the repository is uploaded and Pages deployment succeeds.

On-device test checklist:

1. Add the **Test Sources** repository URL to Hardcover and install one test source.
2. If prompted for browser verification, open that source's browser in Hardcover,
   complete verification yourself, then retry. A desktop-browser session does not
   establish the app's session.
3. Search for a non-explicit title you are authorized to access, open details,
   verify chapters, and load a chapter's images.
4. Try a second search page and another title. For MangaHub, verify a fractional
   chapter too. Report the source, operation, and exact error without cookies/keys.

Run `pnpm run test:experimental`. The normal `pnpm test` also runs these checks.
Compilation output is ignored in `.experimental-build/`. All fixture data is synthetic;
no browser cookies, API keys, or copyrighted chapter images are committed.

## Toonily

Implemented search, query-scoped pagination inherited from HtmlReader, title details,
embedded chapters with POST `/serie/{slug}/ajax/chapters` fallback, chapter images, and the 0.8 browser-verification
request hook. No website preference/age cookies are injected. Protected/encrypted
readers are explicitly unsupported by this draft.

Browser inspection on 2026-09-09 confirmed:

- Search `archmage`: two Madara result cards with expected selectors.
- Sample title: 145 chapter links and matching heading/cover selectors.
- Reader chapter 1: ten `div.page-break > img` elements on `data.tnlycdn.com`.
- Covers use `static.tnlycdn.com`; synopsis now uses `.summary__content`.

Direct HTTP returned Cloudflare 403. Browser DOM inspection is NOT an end-to-end
adapter request test. Still required: actual AJAX response, multi-page search,
media loading and browser-verification retry in Hardcover. Test SourceInfo marks
Toonily ADULT and declares `CLOUDFLARE_BYPASS_REQUIRED`; do not downgrade its rating.

## MangaHub

Implemented the reference GraphQL protocol: search, details, chapters, page-payload
decoding, and retrieval of a site-issued `mhub_access` cookie from the 0.8 request
manager cookie store or a normal site-issued Set-Cookie response. Expired sessions
are not used. This code does not read desktop-browser cookies or rotate
keys/User-Agents to evade quotas. GraphQL rate-limit errors and HTTP 429 pause
requests; missing sessions, malformed JSON and changed schemas produce errors.

The public website loads in the browser. Direct HTTP returned Cloudflare 403.
Still required: verify the API endpoint/schema and cookie-store synchronization
in Hardcover, plus search pagination, chapter retrieval, and image loading.
The test package includes SourceInfo and an upstream icon, but remains unverified.

## Test coverage

Fixtures check Toonily cards, duplicate removal, title parsing, AJAX method,
chapters, page ordering, empty readers, verification errors, and HTTP backoff.
MangaHub fixtures check request encoding/session header, query-scoped pagination,
duplicate removal, fractional chapters, image paths, malformed/missing API data,
missing sessions, and GraphQL backoff. These validate code behavior against the
documented assumptions, not that the live sites accept those assumptions.

## References

- Toonily/Madara endpoint and selector reference: TheNetsky/extensions-generic-0.8,
  branch `madara`, commit `98316b3cf5ba22df791151b20ee4fd10c4c66ef2`.
- MangaHub protocol reference: Nicartjay/PaperbackExt, branch `0.9/stable`, commit
  `e24b697b75142bf5b93c6e50927d30ca0c4864fd`, `src/utils/mangahub/template.ts`.
  The adapter here targets 0.8, not that repository's 0.9 runtime.
