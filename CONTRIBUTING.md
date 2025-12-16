# Contributing

Thanks for your interest in contributing to ATools.

This project is a Next.js (App Router) static-export PWA. Most tools are **pure frontend** and process data **locally in the browser** by default (no uploads).

## Development

### Prerequisites

- Node.js 20+ (CI uses Node 22)
- Yarn 1.x (repo provides `yarn.lock`)

### Setup

```bash
yarn install --frozen-lockfile
yarn dev
```

### Before submitting

```bash
yarn lint
yarn build
```

## Adding a new tool

Create a new directory under `src/app/tools/<slug>/`:

- `tool.json` (required): name/description/keywords/seoDescription
- `page.tsx` (required): `dynamic = "force-static"` + `generateToolMetadata("<slug>")`
- `*Client.tsx` (required): a client component wrapped by `ToolPageLayout`

Run `yarn dev` (or `yarn generate:manifests`) to regenerate:

- `src/app/tools/tool-registry.ts`
- `src/app/tools/tools-meta*.json`
- `public/tools/<slug>/manifest.webmanifest` and `tool.json`

## Project conventions

- Keep tools **frontend-only** .
- Avoid introducing telemetry; if you must, make it opt-in and document it.
- Prefer descriptive names; avoid one-letter identifiers except trivial indices.
- Keep UI consistent with `ToolPageLayout`.

## Reporting bugs / proposing features

- Use GitHub Issues with a minimal reproduction (input file, browser/version, steps).
- For security issues, see `SECURITY.md`.

