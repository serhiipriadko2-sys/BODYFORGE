# BODYFORGE · Mobile install local QA receipt (2026-10-27)

**Lifecycle:** TESTED-LOCALLY. NOT COMMITTED, NOT PUSHED, NOT DEPLOYED, NOT VERIFIED ON A PHYSICAL PHONE.

**Repository:** `C:\github\BODYFORGE` · branch `main` · HEAD `06d5702f5108af7774a5f4a0ea2808c533a256ba`.
Working tree includes other concurrent edits; the build is not a frozen production release.

## Scope and integrity
- Scoped files: **14**, combined size **133878 bytes** at receipt inventory.
- SVG and PNG launcher icons, web manifest, `index.html`, `package.json`, isolated icon generator, PWA QA script, installation documentation, and lazy mobile panel imports.
- All scoped paths existed, were ordinary files (no reparse-point symlinks), and had SHA-256 read back from the PC.
- `git diff --check` returned 0 for scoped tracked edits; PNG generation produced identical hashes on a second run (4/4).
- App and mobile E2E files also contain concurrently evolving project changes. The hashes below describe the whole files, not solely this work.

| Path | Bytes | SHA-256 |
|---|---:|---|
| `index.html` | 1008 | `704f478fa0d444ebd2ba1e71705dd8bdbc3902686ee6bd1cb45077836e104694` |
| `package.json` | 1756 | `a580a7c714c727588348910f7b9a72ff4e62cfae27cc29a45441461f95580247` |
| `src/App.tsx` | 76658 | `f740845459219b4503002ce998b48c185347af8c62ad6eeaa4835722d759d7d1` |
| `qa/mobile-e2e.mjs` | 24311 | `8fdf5182c14755a469319c7f93182d3bfa794b6d1a283e4471e165dc6588acb3` |
| `qa/pwa-install.mjs` | 4124 | `8c0ab6f5e2bbfa95bf8984b4acf604388c7d1bbb24a4a2657beee2d1145518c8` |
| `public/manifest.webmanifest` | 927 | `c0f1b84ce0e4f9a79e83198aebc9de7d4f0e8b9c2176dacbff2f17a02e955f0e` |
| `public/icons/bodyforge-icon.svg` | 514 | `0d16aac886f994b2229064e4bd95fae691823287b329c3f579440a4dac24d4be` |
| `public/icons/bodyforge-maskable.svg` | 579 | `b902f0a4e50a56d78bbb5879d52724114db83dd140c2c2c5306978987b243975` |
| `public/icons/bodyforge-192.png` | 3362 | `c91eb5e74c5ec9371edb896e230932d799b81749a1ac638601d85adfffc43332` |
| `public/icons/bodyforge-512.png` | 5525 | `2e4223c25a93edecec87e1280f704b386372bb2111ef0617ef7942d258bf6e8d` |
| `public/icons/bodyforge-maskable-512.png` | 4593 | `0b83a297284e68381ada89b8ac4225ffb98db2f7f7ce9eb7482c8a1c26b0ebee` |
| `public/icons/bodyforge-180.png` | 3223 | `43115d5e3a50e7b229ddcc5c1c11277bebf1f88d4ed5af0336480977dc086ee1` |
| `scripts/generate-pwa-icons.ps1` | 4036 | `bde15b0559d970633da037c7c99b4026de6c117072a4b45ab34cb365138e7da9` |
| `docs/MOBILE_INSTALL.md` | 3262 | `93719918fc9a674928a2a06f27c44206814c2785383b30273cb8d35b76af7377` |

## Fresh verification on the connected Windows PC
- `npm test -- --reporter=dot`: **452/452 PASS**, 37 files.
- `npm run build`: **PASS**.
- `npm run qa:bundle`: **PASS**. Entry JS 395214 bytes, 20.4% below the registered baseline; pose code remains lazy.
- `npm run qa:pwa` with loopback origin: **PASS**. Manifest, production copies, four raster icons, and HTTP status verified.
- `npm run qa:privacy`: **PASS**, 12 forbidden routes returned HTTP 403.
- `npm run qa:mobile`: **PASS**, including evidence that training-only components load after opening the camera tab.
- `npm run qa:tower20`: **PASS**, exactly one workout/award for twenty synthetic repetitions.
- `npm run qa:avatar`: **PASS**, 21 assertions.
- `npm run qa:pulse-armory`: **PASS**, 54 checks.
- PNG icons regenerated twice: **4/4 identical SHA-256**.

## Limits and next gate
- No service worker or offline promise was introduced.
- A manifest does not guarantee an install button; Android and iOS hardware tests remain **NOT RUN**.
- New exercise recognizers in the concurrently modified working tree are experimental and not hardware-validated.
- Firebase Hosting, Google Play, app stores, GitHub commits and pushes were **not changed**.
- Prior to any Hosting deployment, freeze the exact tree, rerun the bundle/QA suite, confirm Firebase site and rollback preview, then verify the live deployed version.

**Receipt status:** LOCAL PASS, RELEASE NOT READY.
