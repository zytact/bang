# Bang — Living Architecture Document

> Internal reference for contributors. Not a tutorial. Assumes familiarity with browser APIs and TypeScript.
>
> **Project URL:** https://bang.zytact.com  
> **Custom search engine string:** `https://bang.zytact.com?q=%s`  
> **Fork of:** [unduck](https://unduck.link) by [Theo Browne](https://t3.gg/)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Bang Definitions Dataset](#bang-definitions-dataset)
3. [LocalStorage Cache (bang-map)](#localstorage-cache-bang-map)
4. [Inline Early-Redirect Script](#inline-early-redirect-script)
5. [Main Module (src/main.ts)](#main-module-srcmaints)
6. [No-Query Landing Page](#no-query-landing-page)
7. [PWA Layer](#pwa-layer)
8. [Build Pipeline](#build-pipeline)
9. [Code Quality Toolchain](#code-quality-toolchain)

---

## System Overview

WHAT IT IS

- A single-page, fully client-side bang redirect service. Users set `https://bang.zytact.com?q=%s` as their browser's custom search engine. Typing `!g cats` in the address bar redirects to Google's search for "cats"; no server is involved in the redirect.

HOW IT WORKS

- On first visit the Vite bundle (`src/main.ts`) seeds a `bang-map` in `localStorage` — a flat `{ [tag]: urlTemplate }` object built from the 10,000+ bang definitions in `src/bang.ts`.
- On every subsequent navigation the inline `<script>` in `index.html` (which runs before any module is parsed) reads `bang-map` from `localStorage`, resolves the redirect URL, and calls `window.location.replace()` — typically completing before the Vite bundle has even started evaluating.
- If there is no `q` parameter, `main.ts` renders the landing/setup page.

WHY IT WAS BUILT THIS WAY

- DuckDuckGo's own bang service adds a server round-trip (DNS + TLS + HTTP) before the redirect. By storing the full bang map in `localStorage` and performing the redirect in an inline synchronous script, this service eliminates that latency entirely after the first visit.

DATA SHAPES

```
User navigates to:  /?q=!yt+lofi+beats
                        │
            ┌───────────▼────────────┐
            │  Inline <script> IIFE  │  (index.html, synchronous, runs first)
            │  reads localStorage    │
            └───────────┬────────────┘
                        │ localStorage present?
                  Yes ──┘           └── No
                  │                      │
          window.location          bundle loads
          .replace(url)            seedBangMap()
                                   then redirect
```

---

## Bang Definitions Dataset

### src/bang.ts

WHAT IT IS

- A static, pre-compiled TypeScript module that exports a single array (`bangs`) of ~13,000 bang objects sourced from DuckDuckGo's public bang list.

HOW IT WORKS

- Imported by `src/main.ts` at module load time. The array is iterated once by `seedBangMap()` to build the `localStorage` cache and once to resolve `defaultBang`. After that it is not referenced again at runtime.
- Because the entire dataset ships in the JS bundle, there are no network fetches for bang resolution.

WHY IT WAS BUILT THIS WAY

- Embedding the dataset in the bundle means zero network dependency for bang resolution. The trade-off is a large bundle (the file is ~122,000 lines), but Vite's tree-shaking and compression keep this manageable for a one-time download.

DATA SHAPES

```typescript
interface Bang {
    c: string; // Category       e.g. 'AI', 'Tech', 'News'
    d: string; // Domain         e.g. 'youtube.com'
    r: number; // Rank/relevance  0–4
    s: string; // Service name   e.g. 'YouTube'
    sc: string; // Subcategory    e.g. 'Video', 'AI Chat'
    t: string; // Tag (bang key) e.g. 'yt', 'g', 'perp'
    u: string; // URL template   e.g. 'https://www.youtube.com/results?search_query={{{s}}}'
}

export const bangs: Bang[];
```

- The URL template always uses `{{{s}}}` as the query placeholder. This is a Mustache-style triple-brace convention inherited from DuckDuckGo's format.
- Tags include non-ASCII strings (Armenian, Georgian, etc.) as DuckDuckGo supports international bang shortcuts.

DEPENDENCIES AND ASSUMPTIONS

- No external imports. Pure data module.
- Assumes the dataset is accurate and complete for DuckDuckGo's bang list at the time of last update. There is no mechanism to refresh it at runtime.

FAILURE MODES

- If a bang tag is missing from the dataset, the redirect falls back to `defaultBang` (see [Main Module](#main-module-srcmaints)).
- The dataset is never re-fetched; it goes stale as DuckDuckGo adds/removes bangs. Manual updates require re-downloading and replacing `src/bang.ts`.

TESTS AND EVALUATIONS

- No automated tests for dataset integrity or coverage.

---

## LocalStorage Cache (bang-map)

WHAT IT IS

- A serialized JSON object stored at the key `bang-map` in `localStorage`. It maps every bang tag (`t`) to its URL template (`u`) for O(1) lookup without iterating the full `bangs` array.

HOW IT WORKS

- `seedBangMap()` in `src/main.ts` (line 49–54) runs unconditionally on module load. It is a no-op if `bang-map` already exists.

```typescript
// src/main.ts:49-54
function seedBangMap() {
    if (localStorage.getItem('bang-map')) return;
    const map: Record<string, string> = {};
    for (const b of bangs) map[b.t] = b.u;
    localStorage.setItem('bang-map', JSON.stringify(map));
}
seedBangMap();
```

- The inline `<script>` in `index.html` reads this key synchronously before the module bundle loads. If absent (first visit), the inline script exits early and defers to `main.ts`.
- A second key, `default-bang`, stores the user's preferred fallback bang tag (defaults to `'g'` for Google). This key is read but never written by the current codebase — there is no UI to change it.

WHY IT WAS BUILT THIS WAY

- `localStorage` is synchronously readable from an inline script, unlike `IndexedDB` or `Cache API`. This is the only storage mechanism that allows the inline early-redirect script to operate without async overhead.

DATA SHAPES

```typescript
// localStorage key: 'bang-map'
type BangMap = Record<string, string>;
// e.g. { "g": "https://www.google.com/search?q={{{s}}}", "yt": "https://www.youtube.com/results?search_query={{{s}}}", ... }

// localStorage key: 'default-bang'
type DefaultBang = string; // bang tag, e.g. 'g'
```

DEPENDENCIES AND ASSUMPTIONS

- Requires `localStorage` to be available (i.e., not in a private browsing session with storage blocked, not in a sandboxed iframe).
- Assumes `bang-map` is not manually corrupted. No validation on parse.

FAILURE MODES

- If `localStorage` is blocked (strict privacy settings), `stored` is `null` in the inline script, which exits early. `main.ts` will still attempt `seedBangMap()`, fail silently (no error handler on `localStorage.setItem`), and fall through to `getBangredirectUrl()` which uses the in-memory `bangs` array — so redirects still work, just without the early-redirect optimization.
- If the stored JSON is malformed, `JSON.parse` in the inline script will throw and the redirect will not fire. The bundle's `main.ts` path does not re-use the cached map; it uses the `bangs` array directly, so it is unaffected.
- There is no cache invalidation. If `src/bang.ts` is updated in a new deploy, existing users will continue using the stale `bang-map` until they manually clear storage or a cache-busting strategy is implemented.

TESTS AND EVALUATIONS

- No tests.

---

## Inline Early-Redirect Script

WHAT IT IS

- A synchronous IIFE embedded in `index.html`'s `<head>` that attempts a redirect before any JS module is fetched or parsed. This is the primary hot path for returning users.

HOW IT WORKS

- Runs as a classic (non-module) script so it executes synchronously during HTML parsing.

```javascript
// index.html:35-54
(function () {
    var q = new URLSearchParams(window.location.search).get('q');
    if (!q) return;
    q = q.trim();
    var match = q.match(/!(\S+)/i);
    var bang = match ? match[1].toLowerCase() : null;
    var stored = localStorage.getItem('bang-map');
    if (!stored) return; // first visit — defer to main.ts
    var map = JSON.parse(stored);
    var defaultBang = localStorage.getItem('default-bang') || 'g';
    var url = (bang && map[bang]) || map[defaultBang];
    if (!url) return;
    var clean = q.replace(/!\S+\s*/i, '').trim();
    window.location.replace(
        url.replace('{{{s}}}', encodeURIComponent(clean).replace(/%2F/g, '/'))
    );
})();
```

- Query parsing: extracts `q` from search params, finds `!tag` via regex, strips the bang from the clean query.
- `%2F → /` substitution: `encodeURIComponent` encodes `/`, which breaks bang patterns like `!ghr+t3dotgg/unduck` (GitHub repo paths). The substitution restores literal slashes in the query.
- If `bang-map` is absent or the bang is not found, the script returns without redirecting. The page continues loading `main.ts`.

WHY IT WAS BUILT THIS WAY

- Moving the redirect to an inline script avoids the full module parse + evaluation cycle for returning users. On a warm cache, the redirect fires during the initial HTML parse pass — before `main.ts` is even requested.

DEPENDENCIES AND ASSUMPTIONS

- Depends on `bang-map` in `localStorage` being present and valid JSON.
- Assumes the same query parsing semantics as `main.ts`. These are currently kept in sync manually — there is no shared source of truth.

FAILURE MODES

- If `JSON.parse` throws (corrupted storage), the IIFE throws and the redirect does not fire. The rest of the page load continues normally.
- The script is duplicated logic from `main.ts`. Any change to query parsing in `main.ts` must be manually mirrored here.

TESTS AND EVALUATIONS

- No tests. The behavior is effectively tested by end-to-end use.

---

## Main Module (src/main.ts)

WHAT IT IS

- The TypeScript entry point. Handles bang resolution for first-time visitors (no `bang-map` cache), seeds `localStorage`, and renders the landing page when no query is present.

HOW IT WORKS

- Module load order (top-level execution):
    1. `seedBangMap()` is called immediately (line 55) — writes `bang-map` if absent.
    2. `LS_DEFAULT_BANG` is read from `localStorage` (line 57).
    3. `defaultBang` is resolved by searching `bangs` (line 58).
    4. `doRedirect()` is called (line 95) — this is the only explicit entrypoint invocation.

**`getBangredirectUrl()` (lines 60–87):**

```typescript
function getBangredirectUrl() {
    const url = new URL(window.location.href);
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (!query) {
        noSearchDefaultPageRender();
        return null;
    }

    const match = query.match(/!(\S+)/i);
    const bangCandidate = match?.[1]?.toLowerCase();
    const selectedBang =
        bangs.find((b) => b.t === bangCandidate) ?? defaultBang;

    const cleanQuery = query.replace(/!\S+\s*/i, '').trim();
    const searchUrl = selectedBang?.u.replace(
        '{{{s}}}',
        encodeURIComponent(cleanQuery).replace(/%2F/g, '/')
    );
    if (!searchUrl) return null;
    return searchUrl;
}
```

- Bang lookup uses `Array.find` over the full `bangs` array (linear scan, not the `bang-map` hash). This is fine for a one-time operation on first visit, but is O(n) against ~13,000 entries.
- If the bang tag is not found, falls back to `defaultBang` (which itself could be `undefined` if the stored tag no longer exists in the dataset).

**`doRedirect()` (lines 89–93):**

```typescript
function doRedirect() {
    const searchUrl = getBangredirectUrl();
    if (!searchUrl) return;
    window.location.replace(searchUrl);
}
```

- Uses `window.location.replace` (not `assign`) so the bang URL does not appear in browser history.

DEPENDENCIES AND ASSUMPTIONS

- Imports `bangs` from `./bang` — the full dataset is bundled.
- Imports `./global.css` — Vite handles this as a CSS injection.
- Assumes `window.location.href` is the correct URL to parse (i.e., not running in an iframe or non-standard context).

FAILURE MODES

- If `defaultBang` is `undefined` (the stored `default-bang` tag no longer exists in the dataset), `selectedBang` will be `undefined` and `searchUrl` will be `undefined`, causing `doRedirect()` to silently no-op. The user sees a blank page with no query.
- If both `bangCandidate` resolves and `defaultBang` is undefined, there is no fallback — same blank-page result.

TESTS AND EVALUATIONS

- No unit tests. No test files found in the repository.

---

## No-Query Landing Page

WHAT IT IS

- The UI rendered when the page is loaded without a `q` parameter — i.e., when the user visits `https://bang.zytact.com` directly.

HOW IT WORKS

- `noSearchDefaultPageRender()` (lines 4–47 of `main.ts`) imperatively sets `#app`'s `innerHTML` to an HTML string containing:

    - A heading and description
    - A readonly `<input>` displaying the custom search engine URL
    - A copy-to-clipboard `<button>` with SVG icon feedback
    - A `<footer>` with links to the author's site and source

- The copy button:
    1. Calls `navigator.clipboard.writeText(urlInput.value)`
    2. Swaps the icon from `/clipboard.svg` to `/clipboard-check.svg`
    3. Reverts the icon after 2 seconds via `setTimeout`

WHY IT WAS BUILT THIS WAY

- No framework is used. Plain DOM manipulation keeps the bundle minimal for what is essentially a one-element UI.

DATA SHAPES

- No data shapes; pure DOM side-effects.

DEPENDENCIES AND ASSUMPTIONS

- Requires `navigator.clipboard` (available in HTTPS contexts only). Will silently fail in HTTP or sandboxed contexts.
- `/clipboard.svg` and `/clipboard-check.svg` must exist in the `public/` directory.

FAILURE MODES

- `navigator.clipboard.writeText` rejects in non-secure contexts. The `async/await` call is not wrapped in try/catch; the rejection is unhandled.

TESTS AND EVALUATIONS

- None.

---

## PWA Layer

WHAT IT IS

- A Progressive Web App configuration provided by `vite-plugin-pwa`. Generates a service worker that caches app assets for offline use.

HOW IT WORKS

- Configured in `vite.config.ts` with `registerType: 'autoUpdate'`:

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [VitePWA({ registerType: 'autoUpdate' })],
});
```

- `autoUpdate` means the service worker silently updates when a new build is deployed, without prompting the user. Clients pick up the new worker on the next page load after it activates.
- The plugin auto-generates `manifest.json` and the service worker at build time. No explicit manifest configuration is present — defaults are used.

WHY IT WAS BUILT THIS WAY

- Once `bang-map` is seeded and the bundle is cached by the service worker, the entire redirect flow works offline. This is the primary value: the service is fully functional without a live server after the first visit.

DEPENDENCIES AND ASSUMPTIONS

- Requires HTTPS (service workers are restricted to secure contexts).
- The auto-generated manifest uses Vite plugin defaults; no app icons or theme colors are explicitly declared.

FAILURE MODES

- With `autoUpdate`, there is no user notification when a new version is available. If a critical bug fix is deployed, users who have the service worker cached will transparently update on next load, but in-flight sessions are unaffected.
- The `bang-map` cache invalidation problem (see [LocalStorage Cache](#localstorage-cache-bang-map)) is orthogonal to the PWA cache — even if the service worker serves a new bundle, the old `bang-map` persists in `localStorage`.

---

## Build Pipeline

WHAT IT IS

- A two-step build: TypeScript type-checking followed by Vite bundling.

HOW IT WORKS

```
bun run build
  └── tsc           # type-check + emit declarations (noEmit not set, emits to outDir)
  └── vite build    # bundle, tree-shake, minify, generate PWA assets
```

- `tsc` runs first so type errors block the build before Vite processes files.
- Vite handles TypeScript transpilation independently (via esbuild) — `tsc` here serves as a gatekeeper, not the actual transpiler.
- Output lands in `dist/`. The `bang.ts` dataset is bundled inline; no dynamic imports or code splitting is configured.

DEPENDENCIES AND ASSUMPTIONS

- Requires `bun` (not npm/yarn). Lock file is `bun.lock`.
- `tsconfig.json` targets ES2020, module system ESNext, bundler resolution — aligned with Vite's expectations.

---

## Code Quality Toolchain

WHAT IT IS

- ESLint + Prettier + Husky + lint-staged. Enforced on staged files at commit time.

HOW IT WORKS

- Pre-commit hook (`.husky/pre-commit`): runs `bunx lint-staged`
- `lint-staged` config in `package.json`:
    - `*.{ts,js}`: `eslint --fix` then `prettier --write`
    - `*.{json,md,css,html}`: `prettier --write` only
- Prettier config (`prettier.config.js`): 4-space tabs, semicolons, single quotes, ES5 trailing commas.
- ESLint (`eslint.config.js`): ESLint recommended + typescript-eslint recommended + Prettier plugin (disables formatting rules that conflict with Prettier), browser globals.

DEPENDENCIES AND ASSUMPTIONS

- Husky `prepare` script runs on `bun install` to install hooks.
- Developers must use `bun` to install deps for hooks to be registered.
