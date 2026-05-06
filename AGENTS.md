# AGENTS

## Project basics
- Vite + TypeScript single-page app; main entrypoint is `src/main.ts`.
- Bang definitions are the large static list in `src/bang.ts` (mostly sourced from DuckDuckGo).

## Dev commands
- Install deps with `bun install` (lockfile is `bun.lock`).
- `bun run dev` for local dev server.
- `bun run build` runs `tsc` then `vite build` (keep this order).
- `bun run lint` for ESLint; `bun run format` for Prettier.

## Formatting
- Prettier config uses 4-space tabs, semicolons, single quotes (`prettier.config.js`).
