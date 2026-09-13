# ATools · A Pure Tool Site

**English** | [简体中文](README.zh-CN.md)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-16+-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PWA](https://img.shields.io/badge/PWA-Ready-green?logo=pwa)](https://web.dev/progressive-web-apps/)
[![100% Client-Side](https://img.shields.io/badge/100%25-Client--Side-orange)](https://github.com/your-repo)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js)](https://nodejs.org/)

> A collection of online tools that run **100% locally in your browser**: installable as a PWA, supports Next.js static export, and ships with a unified SEO system.

---

## Features

- **Pure frontend**: All file processing runs locally in the browser by default (no server uploads), ideal for privacy-sensitive scenarios.
- **95+ tools**: Covers text/encoding/JSON/images/audio & video/PDF/office formats and other high-frequency needs (see `src/app/tools`).
- **Installable PWA**: Every tool has its own `manifest`, supporting "Add to Home Screen" and offline caching strategies.
- **Chrome extension (optional)**: Provides capabilities that a website alone cannot reliably implement (e.g., full-page screenshots of any web page), plus tool search/opening in a side panel (see `docs/browser-extension.md`).
- **Full i18n support**: All tools support both Chinese and English, built on the `tool.en-us.json` UI fields for an elegant multi-language architecture.
- **FFmpeg.wasm**: Audio/video tools use a locally bundled `@ffmpeg/core`.

<details>
<summary>Built-in tools (sorted by slug)</summary>

- `aes256` — AES256 encryption/decryption
- `api-tester` — API tester
- `audio-encoder` — Audio encoding converter
- `audio-merger` — Audio merger
- `audio-trimmer` — Audio trimmer
- `av-transcoder` — Audio/video transcoder
- `base-converter` — Base converter
- `base32-base58-converter` — Base32/Base58
- `base64` — Base64 encoder/decoder
- `calculator` — Scientific calculator
- `camera` — Web camera
- `case-converter` — Case converter
- `color-converter` — Color format converter
- `color-picker` — Image color picker
- `compass` — Digital compass
- `cron-expression-parser` — Cron expression parser
- `csv-excel-converter` — CSV-Excel converter
- `csv-to-json` — CSV to JSON
- `csv-to-yaml` — CSV to YAML
- `curl-to-code` — cURL to code
- `des` — DES encryption/decryption
- `escape-tool` — Character escape tool
- `excel-to-json` — Excel to JSON
- `gif-optimizer` — GIF optimizer
- `gif-to-video` — GIF to video
- `gzip-deflate-tool` — Gzip/deflate tool
- `hash-tools` — Hash tools
- `hmac-generator` — HMAC generator
- `html-stripper` — HTML tag stripper
- `http-header-parser` — HTTP header parser
- `icns-generator` — ICNS icon generator
- `ico-generator` — ICO icon generator
- `image-compressor` — Image compressor
- `image-converter` — Image format converter
- `image-cropper` — Image cropper
- `image-resizer` — Image resizer
- `json-compare` — JSON compare
- `json-formatter` — JSON formatter
- `json-schema-validator` — JSON Schema validator
- `json-to-csharp-class` — JSON to C#
- `json-to-csv` — JSON to CSV
- `json-to-excel` — JSON to Excel
- `json-to-go-struct` — JSON to Go
- `json-to-java-pojo` — JSON to Java
- `json-to-json-schema` — JSON to Schema
- `json-to-kotlin-data-class` — JSON to Kotlin
- `json-to-python-model` — JSON to Python
- `json-to-rust-serde` — JSON to Rust
- `json-to-typescript` — JSON to TypeScript
- `json-yaml-converter` — JSON-YAML converter
- `jwt-generator` — JWT generator
- `jwt-token-decoder` — JWT decoder
- `markdown-pdf-converter` — Markdown to PDF
- `music-player` — Web music player
- `noise-meter` — Digital noise meter
- `p2p-file-transfer` — P2P file transfer
- `palette-generator` — Smart palette generator
- `password-strength-checker` — Password strength checker
- `pdf-compressor` — PDF compressor
- `pdf-merge` — PDF merger
- `pdf-split` — PDF splitter
- `pdf-stamp` — PDF stamping
- `pdf-to-images` — PDF to images
- `pdf-to-text` — PDF to text
- `pdf-trim` — PDF page trimmer
- `pem-jwk-toolkit` — PEM/JWK toolkit
- `ppt-compressor` — PPT compressor
- `protractor` — Digital protractor
- `qr-decoder` — QR code decoder
- `qr-generator` — QR code generator
- `qr-scanner` — QR code scanner
- `random-number-generator` — Random number generator
- `random-password-generator` — Random password generator
- `regex-tester` — Regex tester
- `rsa-key-generator` — RSA key generator
- `salt-generator` — Random salt generator
- `screen-ruler` — Screen ruler
- `seal-extractor` — Smart seal extractor
- `sql-formatter` — SQL formatter
- `svg-converter` — SVG to image
- `text-diff` — Text diff
- `timer` — Multi-purpose timer
- `timestamp-converter` — Timestamp converter
- `timezone-converter` — Timezone converter
- `unit-converter` — Unit converter
- `url-encoder` — URL encoder/decoder
- `url-parser` — URL parser
- `uuid-generator` — UUID generator
- `video-player` — Web video player
- `video-to-gif` — Video to GIF
- `video-trimmer` — Video trimmer
- `websocket-tester` — WebSocket tester
- `word-compressor` — Word compressor
- `word-counter` — Word counter
- `xmind-viewer` — XMind viewer
- `xml-json-converter` — XML to JSON

</details>

---

## Getting Started

### Requirements

- Node.js **20+** (CI uses Node 22)
- **Yarn 1.x** recommended (the repo ships a `yarn.lock`)

### Local development

```bash
yarn install --frozen-lockfile
yarn dev
```

Open `http://localhost:3000`.

> The first `dev/build` automatically generates tool navigation data and PWA assets (see `scripts/`).

---

## Development & Build

### Common commands

- `yarn dev`: local development (Next Dev)
- `yarn build`: production build (CI uses `next build --webpack`)
- `yarn build:turbo`: production build (`next build`, for comparison/debugging)
- `yarn lint`: ESLint
- `yarn generate:manifests`: generate `public/tools/<slug>/manifest.webmanifest` and navigation data
- `yarn generate:sw`: generate `public/sw.js`
- `yarn scaffold:tool <slug>`: interactively scaffold a new tool (`tool.json` / `tool.en-us.json` / `page.tsx` / `*Client.tsx`)
- `yarn check:tools`: verify tool directory config completeness (missing files, required fields, SEO metadata calls, etc.)

### Optional: enable Microsoft Clarity

To enable site behavior analytics, set the environment variable before building:

```bash
NEXT_PUBLIC_CLARITY_ID=your-clarity-project-id
```

The current integration strategy is consent-mode by default: the site preloads Clarity but always runs with `analytics_Storage=denied` and `ad_Storage=denied` until the user consents, collecting only cookieless, anonymous page-level usage data. Once the user opts in via the "Analytics settings" in the footer, it upgrades to the full analysis mode with cross-page correlation. The main interaction area of tool pages is additionally masked by default to prevent session replays from exposing users' raw content in the tools.

### Development tips

1. **Progressive development**: implement the basic feature first, then add advanced capabilities.
2. **Test frequently**: verify functionality after every change.
3. **Code review**: check code quality and type safety before committing.
4. **Performance monitoring**: regularly check page load speed and resource usage.
5. **Multi-language testing**: make sure everything works in both Chinese and English.

---

## Project Structure (core conventions)

- `src/app/tools/<slug>/`: one directory per tool (route: `/<locale>/tools/<slug>`)
  - `tool.json`: tool config (name/description/keywords/SEO text, etc.)
  - `tool.en-us.json`: English UI config file (with `ui` fields)
  - `page.tsx`: App Router page exporting `dynamic = "force-static"` and `metadata`
  - `*Client.tsx`: client component using the shared `ToolPageLayout`
- `src/lib/`: shared logic for tool config, SEO generation, etc.
- `src/components/ToolPageLayout.tsx`: unified tool page layout (SEO/structured data/hidden SEO text)
- `src/components/ToolConfigProvider.tsx`: tool config context with i18n support
- `scripts/`:
  - `generate-tool-manifests.mjs`: scans `tool.json` to generate tool manifests, navigation data, and the tool registry
  - `generate-sw.mjs`: generates `public/sw.js`

---

## Adding a New Tool

### Recommended workflow (scaffold + check)

1. Scaffold the base files (recommended):

```bash
yarn scaffold:tool my-tool
```

You can also run it without arguments and enter the slug interactively:

```bash
yarn scaffold:tool
```

The script interactively asks for the following (press Enter to accept defaults):

- `slug`: tool directory name, must be kebab-case (e.g. `text-to-speech`)
- Chinese/English `shortName`
- Chinese `category`
- Chinese/English `name` (used for the SEO title)
- Chinese/English `description` (used for the description and default SEO copy)

The script automatically generates:

- `src/app/tools/<slug>/tool.json`
- `src/app/tools/<slug>/tool.en-us.json`
- `src/app/tools/<slug>/page.tsx`
- `src/app/tools/<slug>/<PascalCase>Client.tsx`

2. Fill in the business logic and SEO copy (especially `seoDescription` and `keywords`).

3. Run the config check:

```bash
yarn check:tools
```

How to read the results:

- `ERROR`: the command exits non-zero (CI fails); these must be fixed.
- `WARN` only: the command passes, but issues should be addressed soon (e.g. missing `tool.en-us.json`, `page.tsx` missing `dynamic = "force-static"`, etc.).
- If everything passes, the output looks like:

```text
[check-tools] Check completed.
Tool count: <N>
Total errors: 0
Total warnings: 0
```

### 1. Create the tool directory and base files

```bash
mkdir src/app/tools/my-tool
```

### 2. Add the tool config files

**`tool.json`** (tool metadata):
```json
{
  "name": "Free Online My Tool - ATools",
  "shortName": "My Tool",
  "description": "One-sentence description of what this tool does.",
  "seoDescription": "Detailed SEO-optimized description including keywords, tool benefits, and use cases, 200-300 characters, optimized for search engines and LLMs...",
  "category": "Tool Category",
  "lang": "en-US",
  "themeColor": "#0f172a",
  "backgroundColor": "#0f172a",
  "icon": "/icon.svg",
  "keywords": ["free tool", "online tool", "keyword"]
}
```

**`tool.en-us.json`** (English UI config):
```json
{
  "name": "Free Online My Tool - ATools",
  "shortName": "My Tool",
  "description": "Brief description of what this tool does.",
  "seoDescription": "Detailed SEO-optimized description for search engines and LLM indexing, 200-300 characters...",
  "category": "Tool Category",
  "lang": "en-US",
  "ui": {
    "title": "My Tool",
    "inputLabel": "Input",
    "outputLabel": "Output",
    "processButton": "Process",
    "clearButton": "Clear",
    "inputPlaceholder": "Enter your input here...",
    "outputPlaceholder": "Results will appear here...",
    "errorMessage": "Error: {message}",
    "successMessage": "Processing completed successfully!"
  },
  "keywords": ["free online tool", "web tool", "keyword"]
}
```

### 3. Add the page component

**`page.tsx`**:
```tsx
import { generateToolMetadata } from "../../../lib/generate-tool-page";
import MyToolClient from "./MyToolClient";

export const dynamic = "force-static";
export const metadata = generateToolMetadata("my-tool");

export default function Page() {
  return <MyToolClient />;
}
```

### 4. Add the client component

**`MyToolClient.tsx`**:
```tsx
"use client";

import { useOptionalToolConfig } from "../../../components/ToolConfigProvider";
import ToolPageLayout from "../../../components/ToolPageLayout";

// English defaults
const DEFAULT_UI = {
  title: "My Tool",
  inputLabel: "Input",
  outputLabel: "Output",
  processButton: "Process",
  clearButton: "Clear",
  inputPlaceholder: "Enter your input here...",
  outputPlaceholder: "Results will appear here...",
  errorMessage: "Error: {message}",
  successMessage: "Processing completed successfully!"
} as const;

// Type-safe UI copy config
type MyToolUi = typeof DEFAULT_UI;

export default function MyToolClient() {
  const config = useOptionalToolConfig("my-tool");
  // Config merge: English takes priority, falls back to defaults
  const ui: MyToolUi = {
    ...DEFAULT_UI,
    ...((config?.ui ?? {}) as Partial<MyToolUi>)
  };

  return (
    <ToolPageLayout toolSlug="my-tool">
      <div className="glass-card rounded-3xl p-6 shadow-2xl ring-1 ring-black/5">
        <div className="text-sm font-semibold text-slate-900">{ui.title}</div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {ui.inputLabel}
            </label>
            <textarea
              placeholder={ui.inputPlaceholder}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
            />
          </div>

          <div className="flex gap-2">
            <button className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
              {ui.processButton}
            </button>
            <button className="rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-200">
              {ui.clearButton}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              {ui.outputLabel}
            </label>
            <textarea
              placeholder={ui.outputPlaceholder}
              readOnly
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
          </div>
        </div>
      </div>
    </ToolPageLayout>
  );
}
```

---

## Contributing

### Core principles

- **PR guidelines**: keep PRs small and focused; one feature or fix per PR.
- **Pure frontend**: keep tools running purely in the browser (no backend dependencies); never upload user files.
- **Multi-language support**: all tools must provide complete i18n support (via the `ui` fields in `tool.en-us.json`).
- **UI/UX consistency**: prioritize consistent layout and accessibility.

### Code standards

- **Type safety**: all TypeScript code must pass strict type checking.
- **Test verification**: make sure everything works in both languages.
- **Conventions**: follow the `src/app/tools/<slug>/` directory conventions and unified code patterns.

See also:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`

---

## License

GNU AGPLv3. See `LICENSE`.
