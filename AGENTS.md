# Repository Guidelines

## Project Structure & Modules

- Root contains two main projects:
  - `site/`: Next.js 16 App Router app for **纯粹工具站** (PWA, tools, SEO, CI scripts).
  - `getseal/`: Python prototype scripts and assets for seal extraction experiments.
- Frontend source lives in `site/src/app`, assets in `site/public`, build scripts in `site/scripts`, and CI workflows in `site/.github/workflows`.

## Build, Test, and Development

- Install deps (frontend): `cd site && npm install`.
- Local dev: `cd site && npm run dev` (Turbopack, hot reload).
- Production build (local): `cd site && npm run build`.
- CI/webpack build (matches GitHub Actions): `cd site && npm run build:webpack`.
- Static export + preview: after a successful build, `out/` contains the exported site; serve with any static HTTP server.
- Lint: `cd site && npm run lint`.

## Coding Style & Naming

- TypeScript + React function components only; keep components small and focused.
- Follow the existing TypeScript configuration and `eslint.config.mjs` (Next.js ESLint). Fix all lint errors before pushing.
- Use descriptive names; avoid single-letter identifiers except for trivial indices.
- Place new tools under `site/src/app/tools/<slug>` with:
  - `page.tsx`, a client component file, and a `tool.json` used by manifest-generation scripts.

## Testing & Verification

- No formal automated test suite is configured yet; verify behavior manually via `npm run dev` and checking critical flows in major browsers.
- If you introduce a test framework, keep it lightweight and colocate tests with the code they cover (e.g., `Component.test.tsx`). Discuss larger testing changes in a PR first.

## Commit & Pull Request Guidelines

- Use clear, imperative commit messages (e.g., `feat: add watermark remover tool`, `fix: seal extractor threshold handling`).
- PRs should include:
  - A concise description of changes and motivation.
  - Notes on breaking changes or migrations (if any).
  - For UI changes, short text or screenshots describing the impact.
- Keep changes focused; prefer several small PRs over one very large one.

