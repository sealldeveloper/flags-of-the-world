# ScuffedUNO presentation assets — provenance and licence notes

These are the actual publicly served **classic** presentation assets from <https://scuffeduno.online/>, retrieved for the requested local iroh port. They are not original artwork by this project. `provenance.json` records each original URL, retrieval timestamp, size, and SHA-256 digest.

- `classic.webp`: unmodified 2181 × 1552 source atlas (its payload is PNG despite the upstream extension).
- `logo.webp`: unmodified ScuffedUNO logo.
- `logo-iroh-edition.svg`: separate edition mark embedding the unchanged logo beside a new **IROH EDITION** badge. Poppins SemiBold lettering is outlined, so no external font or image requests are required. `derived-logo.json` records its hashes and the original creator; rebuild with `python3 scripts/make-uno-logo.py` (build-only dependency: fonttools).
- `uno-button.png`: unmodified upstream in-game UNO button (`img/logo.648f8b18.png`); its URL, retrieval timestamp and digest are in `uno-button-provenance.json`.
- `favicon-16x16.png`, `favicon-32x32.png`: unmodified upstream tab icons, used only by the UNO page. Source URLs and hashes are in `favicon-provenance.json`.
- `avatar.webp`, `avatar-border.webp`: unmodified default orange-dot avatar and white border. No accounts, profile service, shop, or paid cosmetic unlocks are implemented.
- `rules/`: five unmodified 512 × 512 lobby rule illustrations; exact source URLs and hashes are in `rules/provenance.json`. These replace the text-heavy checkbox cards with the original's illustrated grid.
- The 63 `*.png` card files are lossless rectangular crops of the atlas: 165 × 256 pixels, 168-pixel column pitch, 259-pixel row pitch. No redraw, font replacement, recolouring, or compression loss is applied. Rows: red, green, yellow, blue, wild, draw-four. Number order: 1–9, 0, draw-two, skip, reverse. The last row's sixth cell is the card back.

**Original creator: [Freddie Nelson](https://freddienelson.co.uk/)**, whose portfolio lists Scuffed Uno among his work. The entry screen has a prominent author credit and link to the original game; the Credits dialog remains accessible in-game. Attribution does not imply the author's endorsement or replace permission to redistribute.

No public reuse licence for ScuffedUNO's artwork was found. Public accessibility is **not** treated as a redistribution licence. The operator requested publication of this port. That request is not recorded here as an independently verified redistribution licence. ScuffedUNO and UNO branding remain their respective owners' property.

The Three.js dependency is separately vendored under its MIT licence in `../../vendor/three/`. The renderer adapter in `../../scene.mjs` is new code; the original application bundles, Socket.IO networking, authentication, adverts, payments, and account-management code are not included or executed.
