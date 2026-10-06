# Test sources — October 2026 update

**MangaHub 0.1.0, Toonily 0.1.0 and Kagane 0.1.0** are published in the main catalog at the user's explicit request. Kagane is still unverified and blocked by browser verification in app tests; it is not represented as working. The older opt-in testing catalog remains available for existing installations. Source implementations live in `src/`; the `experimental/` entry points preserve test tooling compatibility. Existing source IDs are unchanged.

```sh
GITHUB_REPOSITORY=BigBookMan24/hardcover-hub-sources pnpm test
GITHUB_REPOSITORY=BigBookMan24/hardcover-hub-sources pnpm run build:testing
```

GitHub Actions deploys `bundles/testing/0.8/` alongside the main catalog on a push to `main`. Installation URL after deployment:

`https://bigbookman24.github.io/hardcover-hub-sources/testing/0.8/`

## Implementations

- **Toonily:** fresh implementation based on the current public site, replacing the old draft. Uses `/search/{query}`, query-scoped next-page links, current metadata fields, embedded full chapter lists and the reader's lazy/eager image URLs. Preserves fractional chapters and image order. Rated ADULT; no content/age preference cookies are injected.
- **MangaHub:** HTML search, title metadata and complete chapter tabs, with the site's normal encrypted GraphQL chapter manifests for reading. The server HTML contains only preview pages and is never used as a full chapter. Uses displayed chapter numbers instead of occasional database IDs in links, preserving existing numeric chapter IDs. Site-issued session keys stay in memory; AES-GCM verifies authentication tags. A changed website session invalidates its chapter key, and an expired key gets the same single refresh as the site's reader. Rate limits and verification challenges are not retried.
- **Kagane:** new English v2 API adapter. Requests Safe/Suggestive search results, respects API pagination, handles title metadata and chapter ordering, obtains a normal site-issued reader session, and returns ordered signed image URLs from known Kagane image servers. Session tokens are kept in memory, not shipped with the source. No browser-script execution or challenge solving is added.

Shared transport limits requests to one per second, pauses after HTTP 429, coalesces concurrent GETs and caches up to eight GET responses for 30 seconds. Failed responses are not cached. Browser verification and server failures produce actionable errors.

## Validation and limits

Checked on 2026-10-06:

- **Toonily PASS (sampled live iOS runtime):** search and title metadata; Boss in School: The Beginning chapters 6 and 1 (18 and 5 pages); The Beginning After the End chapters 255 and 1 (121 and 43 pages). First and last images of every sampled chapter returned HTTP 200 and decoded using `UIImage` in the iPhone Air iOS 26.5 simulator. Its full chapter list included 272 entries.
- **MangaHub PASS (sampled live iOS runtime):** search and metadata for Lookism and Lookism (Bookmanga); 632 chapter rows each; chapters 627 and 1 returned full manifests of 51 and 62 pages respectively. First and last images decoded successfully for all four chapter loads. Testing exposed and fixed database-ID ordering, six-page preview truncation, and expired/mismatched chapter-session keys.
- **Kagane BLOCKED / NOT VERIFIED:** the actual Hardcover runtime received a Cloudflare browser challenge on search. Native homepage + search requests were also challenged. The website works in a desktop browser, but that session does not establish access in Hardcover. Search, metadata, chapter manifests and image decoding remain unverified in the app. The user explicitly authorized full publication after being informed of this limitation. It remains labeled unverified; install it and complete normal verification in Hardcover on the iPhone before assessing reading compatibility.
- Automated fixtures cover search query encoding and pagination reset, metadata, fractional chapters, hidden tabs, alternate chapter copies, database IDs versus display numbers, full encrypted manifests, authentication-tag failures, changed/expired reader sessions with bounded refresh, lazy images, image order, URL host restrictions, normal reader session reuse, malformed responses, failed-request retries, HTTP 429 backoff and request coalescing. Tests run against both compiled TypeScript and the generated installable bundles.

Fixtures and browser inspection do **not** establish on-device compatibility. Simulator samples establish only the tested titles/chapters, not whole-site reliability or a physical iPhone session. A desktop-browser session does not establish the app's session. If challenged, open the source inside Hardcover, complete the site's verification and retry. No challenge bypass or quota evasion is attempted.

## On-device check

1. Refresh the main repository (or an existing Test Sources installation) and install/update the source.
2. If verification is requested, go to Settings → Extensions → the source → Open Source Website. Complete the website check, wait for the site to load, then tap Use Session.
3. Search for an authorized, non-explicit title and open its metadata and chapters.
4. Open a chapter and confirm images actually load, including its last page.
5. Try another title, a second search page and a fractional chapter where available.
6. Report the source, failing operation and exact error. Do not send cookies or session keys.

## References and assets

The fresh Toonily and MangaHub parsers were written from public site markup. MangaHub’s reader protocol was checked against its current public client/chapter JavaScript and normal session responses; it uses `@noble/ciphers` 1.3.0 for authenticated decryption (MIT notice in `licenses/noble-ciphers-MIT.txt`). Their existing test-source icons are retained; original icon provenance and notices remain in `licenses/` and the repository's `THIRD_PARTY_NOTICES.md`.

Kagane API schema reference: `keiyoushi/extensions-source`, `src/all/kagane/src/eu/kanade/tachiyomi/extension/all/kagane/{Kagane,Dto,Filters}.kt`, inspected 2026-10-06. Dto revision: `522dd571b6f8f8852a1971d67394a4f958c91586`. The adapter is an independent TypeScript implementation, not a port of the Kotlin implementation. Its icon is the site's public `/favicons/favicon-96x96.png`; logo rights remain with the site.

Historical icon references:
- Toonily: `TheNetsky/extensions-generic-0.8`, branch `madara`, commit `98316b3cf5ba22df791151b20ee4fd10c4c66ef2`.
- MangaHub: `Nicartjay/PaperbackExt`, branch `0.9/stable`, commit `e24b697b75142bf5b93c6e50927d30ca0c4864fd`.
