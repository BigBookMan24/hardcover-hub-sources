# Third-party notices

Development-only Toonily and MangaHub adapters reference the projects and pinned
commits documented in `experimental/README.md`. Their upstream license notices
are retained in `experimental/licenses/`; Madara's package metadata declares
GPL-3.0-or-later, and PaperbackExt carries the MIT notice. No third-party chapter
content or live session tokens are bundled with these drafts.

Test-source icons in `experimental/icons/` are copied from the corresponding
upstream extension folders listed in `experimental/README.md`. Site logo rights
remain with their respective owners; the images are not covered by our code license.

The repository scaffolding was adapted from BigMan’s extensions. The new
MangaBuddy and MangaKatana adapters and the imported Atsu adapter are included.
The inherited upstream attribution is preserved below:

- Project: `TheNetsky/netskys-extensions`
- Branch: `0.8`
- Upstream commit: `3c5b6696d9bba55edeca850c22d234f0df490e60`
- Original source author metadata: Netsky

The upstream branch contains a top-level MIT `LICENSE` carrying Copyright
(c) 2020 Paperback, while its `package.json` declares
`GPL-3.0-or-later`. Both pieces of upstream metadata are preserved here; no
claim is made that they resolve rights in third-party site names, icons,
content, or services.

The Paperback toolchain and package dependencies retain their respective
licenses and notices.

Site names, logos, and content remain the property of their respective owners.

## Atsu

`src/Atsu/` and its shared `src/SearchFilters.ts` dependency are copied unchanged
from `big-man25/hardcover-extensions`, commit
`a6a14d44be19f1fb445a167af5df4319bb86e932`. Original author metadata and existing
catalog filters are preserved. This is a pinned copy, not an automatic upstream sync.

## Hardcover Reader icon

`assets/hardcover-app-icon.jpg` is the Hardcover - Reader app icon from its
[App Store listing](https://apps.apple.com/us/app/hardcover-reader/id6802157187),
retrieved through Apple's public lookup service. Copyright remains with Steas
Software; it is not covered by this repository's code license. Used to identify
the compatible app, without implying affiliation or endorsement.
