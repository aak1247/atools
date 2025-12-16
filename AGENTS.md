# Repository Guidelines

## Project Structure & Modules

- Root contains two main projects:
  - `site/`: Next.js 16 App Router app for **纯粹工具站** (PWA, tools, SEO, CI scripts).
  - `getseal/`: Python prototype scripts and assets for seal extraction experiments.
- Frontend source lives in `site/src/app`, assets in `site/public`, build scripts in `site/scripts`, and CI workflows in `site/.github/workflows`.

### Key Directories

- `src/app/tools/[tool-name]/` - Individual tool directories
- `src/lib/` - Shared utilities (tool-config.ts, generate-tool-page.ts)
- `src/components/` - Shared components (ToolPageLayout.tsx)
- `src/hooks/` - Custom hooks (useToolConfig.ts)
- `scripts/` - Build and utility scripts

## Build, Test, and Development

- Install deps (frontend): `cd site && npm install`.
- Local dev: `cd site && npm run dev` (Turbopack, hot reload).
- Production build (local): `cd site && npm run build`.
- CI/webpack build (matches GitHub Actions): `cd site && npm run build:webpack`.
- Static export + preview: after a successful build, `out/` contains the exported site; serve with any static HTTP server.
- Lint: `cd site && npm run lint`.

### Additional Scripts

- `npm run generate:manifests` - Generate PWA manifest files.

## Coding Style & Naming

- TypeScript + React function components only; keep components small and focused.
- Follow the existing TypeScript configuration and `eslint.config.mjs` (Next.js ESLint). Fix all lint errors before pushing.
- Use descriptive names; avoid single-letter identifiers except for trivial indices.
- Place new tools under `site/src/app/tools/<slug>` with:
  - `page.tsx` - Uses `generateToolMetadata()` for unified SEO metadata.
  - Client component file (e.g., `MyToolClient.tsx`) - Uses `ToolPageLayout` for unified layout.
  - `tool.json` - Tool configuration with SEO fields (name, description, seoDescription, keywords).

## SEO Optimization System

All tools use a unified SEO system:

1. **tool.json** - Contains SEO-optimized fields:
   - `name`: Full name with "免费在线" keywords
   - `description`: Short description for display
   - `seoDescription`: Detailed SEO text (200-300 chars) for search engines and LLMs
   - `keywords`: Array of relevant keywords

2. **Page Structure**:
   ```tsx
   // page.tsx
   import { generateToolMetadata } from "../../../lib/generate-tool-page";
   export const metadata = generateToolMetadata("tool-slug");
   
   // Client component
   import ToolPageLayout from "../../../components/ToolPageLayout";
   <ToolPageLayout toolSlug="tool-slug">{children}</ToolPageLayout>
   ```

3. **Auto-generated Features**:
   - Page metadata (title, description, keywords, OpenGraph)
   - JSON-LD structured data (Schema.org WebApplication)
   - Hidden SEO text via `sr-only` class

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

