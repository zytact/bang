# AGENTS

## Project basics

- Vite + TypeScript single-page app; main entrypoint is `src/main.ts`.
- Bang definitions are the large static list in `src/bang.ts`.

## Dev commands

- Install deps with `bun install` (lockfile is `bun.lock`).
- `bun run dev` for local dev server.
- `bun run build` runs `tsc` then `vite build` (keep this order).
- `bun run lint` for ESLint; `bun run format` for Prettier.
- `bun run typecheck` runs `tsc --noEmit`.

## Git hooks

- Pre-commit runs `bunx lint-staged` (lint + prettier on staged files only).

## Formatting

- Prettier config uses 4-space tabs, semicolons, single quotes (`prettier.config.js`).
