# AGENTS.md

## Project overview

Chrome Manifest V3 extension ("Bookmark Viewer") that displays bookmarks in a popup grid with pinyin search. Main code is in `chrome-menu-optimizer/`; Node-based tests are in `tests/`.

## Architecture

- **No build system.** Plain vanilla JS loaded via `<script>` tags. No npm, no bundler, no transpiler.
- **No content scripts.** `manifest.json` has no `content_scripts`. The extension is popup-only, plus one standalone page (`checker.html`).
- **CSS is inline** in each HTML file's `<style>` block. There is no `styles.css` file.
- **Script load order matters** — defined in `popup.html`:
  1. `mock-chrome-api.js` (no-op in the real extension; only active for file:// testing) → 2. `error-handler.js` → 3. `bookmark-tree.js` → 4. `bookmark-checker.js` → 5. `view-settings.js` → 6. `usage-manager.js` → 7. `pinyin-search.js` → 8. `popup.js`
  - `checker.html` loads: `mock-chrome-api.js` → `bookmark-tree.js` → `bookmark-checker.js`
- **Shared module**: `window.BMV.bookmarkTree` (in `bookmark-tree.js`) owns the in-memory bookmark tree index and all data access — one `getTree()` then zero-IPC reads, invalidated by `chrome.bookmarks` change listeners and after CRUD. Both the popup and the checker page consume it.
- **Globals**: `window.BMV` (shared), `window.bookmarkChecker`, `window.bookmarkViewSettings`, `window.bookmarkUsageManager`; `escapeHtml` / `isDangerousUrl` / `getFaviconUrl` are globals declared in `popup.js`.
- `config.js` (CONFIG/ConfigUtils globals) is a reference module loaded by nothing.

## Key files

| File | Role |
|---|---|
| `popup.html` | Popup entry: inline CSS + script loading |
| `popup.js` | Main logic (~1415 lines): batched grid rendering with event delegation, debounced search with race guard, drag-to-move (HTML5 DnD), context menu, CRUD |
| `bookmark-tree.js` | Shared in-memory tree index + data access (`window.BMV.bookmarkTree`) |
| `bookmark-checker.js` | Bookmark validity checker (popup button entry + `checker.html` bootstrap) |
| `checker.html` | Standalone checker page — long checks survive popup dismissal |
| `view-settings.js` | Grid columns + folder-preview count; `window.bookmarkViewSettings` (`ready`/`get`/`save`), persisted in `chrome.storage.local` key `bookmark_view_settings` |
| `usage-manager.js` | Usage stats (debounced writes, `ready` promise, orphan pruning) |
| `pinyin-search.js` | Pinyin search (polyphonic chars, initials, full pinyin) |
| `error-handler.js` | Global error/rejection capture |
| `mock-chrome-api.js` | Mock Chrome API for opening the HTML files directly via file:// |
| `background.js` | Service worker: cross-origin fetch for bookmark validity checks (http/https only; on network failure retries `no-cors` and returns opaque `status: 0` = reachable only, not a verified status code) |
| `manifest.json` | MV3 manifest; permissions `bookmarks` + `activeTab` + `storage`; host_permissions `http://*/*` + `https://*/*` |

## Development

- **No build commands.** Load `chrome-menu-optimizer/` as unpacked extension in `chrome://extensions/` with Developer Mode; click the reload button after editing.
- **Tests are Node-based** (no browser needed): `node tests/<name>.test.js`
  - `bookmark-tree.test.js` — tree index, zero-IPC access, invalidation, API fallback (vm-loads the real module)
  - `bookmark-checker.test.js` — classification, cancel/re-entrancy, URL generation
  - `pinyin-search.test.js` — polyphonic and matching behavior
  - `view-settings.test.js` — sanitize/fallback for columns and preview counts
  - `popup-security.test.js` — escaping and dangerous-URL checks (extracted from real `popup.js` source)
  - `dnd.test.js` — drag-move pure logic: cycle guard (`isSelfOrAncestorOf`), same-parent `move` index normalization, mock `move` semantics
  - `popup-smoke.test.js` — CDP-driven smoke test against real Edge (`popup.html` + `checker.html`); requires launching Edge with `--remote-debugging-port=9333` first (see the header of the script)
- `dnd-semantics.js` (not a `.test.js`) is a one-off CDP probe that empirically verifies `chrome.bookmarks.move` index semantics against a real Edge with the extension loaded; run it the same way as the smoke test.
- `popup.html` / `checker.html` can also be opened directly in a browser (file://) — `mock-chrome-api.js` then provides a mock `chrome` API with sample bookmarks.
- Debug HTML files (`diagnostic-test.html`, `test-search.html`, `search-debug.html`) are self-contained and browser-opened directly.

## Gotchas

- **README is stale.** It references files that don't exist (`content-script.js`, `styles.css`, `test-framework.js`, `tests.js`, `test-suite.html`, `simple-test.html`). Trust the actual directory listing, not the README.
- **No TTL cache anymore.** Bookmark freshness comes from `bookmark-tree.js`: change listeners (`onCreated`/`onRemoved`/`onChanged`/`onMoved`/`onChildrenReordered`/`onImportEnded`) plus explicit invalidation after CRUD in `popup.js`.
- **Popup width is fixed at 800px** (the browser's hard cap, `ExtensionPopup::kMaxWidth` in Chromium source). Card width is derived from `bookmarkViewSettings` columns (2–5, default 3) via `repeat(N, minmax(0, 1fr))`: 2 columns ≈ 374px, 3 ≈ 245px, 5 ≈ 142px — always filling the row, never overflowing. `await bookmarkViewSettings.ready` before first render so column count does not jump from a stale default. There is deliberately **no viewport-width media query**: since Edge 153's popup autosize measures root scroll width, a `max-width` media query setting `body { width: 100vw }` self-locks the popup at its initial narrow width (fixed 2026-08).
- **Bookmark checking runs in the standalone `checker.html` page.** The popup only opens it (via `chrome.tabs.create`), so long checks are not killed when the popup closes. Network checks go through `background.js` via `chrome.runtime.sendMessage({action:'fetchUrl'})` — not `fetch` from the popup.
- `escapeHtml` escapes `& < > " '` (attribute-context safe); URLs pass through `isDangerousUrl` before opening. Keep both when adding new render paths.
- **Drag-to-move index semantics.** `chrome.bookmarks.move(id, {index})` interprets `index` in the *pre-removal* array and Chromium auto-decrements it when the item moves down within the same parent (empirically verified on Edge 153 by `tests/dnd-semantics.js`: `move(A, index:2)` on `[A,B,C,D]` → `BACD`). So `normalizeMoveIndex` in `popup.js` adds `+1` for downward same-parent moves. The UI can never display an invalid cycle target (a dragged folder's card is only visible one level above its descendants), but the `isSelfOrAncestorOf` guard stays as defense-in-depth. HTML5 DnD does not work on touch — desktop popup only.
- The extension targets Chrome 88+ and Chromium-based browsers only.
- Doc files in `chrome-menu-optimizer/` (e.g., `ADVANCED_ARCHITECTURE.md`, `CODE_QUALITY.md`) are design notes, not current-state docs. Verify claims against actual code.
