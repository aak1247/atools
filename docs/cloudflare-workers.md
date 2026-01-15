# Cloudflare Workers deploy (Wrangler)

This repo is configured for **static export** (`next.config.ts` has `output: "export"`).
The build output is the `out/` directory, and it is served via **Workers + Assets**.

## Files

- `wrangler.toml`: Worker config + assets directory (`./out`)
- `cf/worker.ts`: Serves static assets and falls back to `*.html` for clean URLs

## One-time setup

1. Install dependencies: `npm install` (or `yarn install`)
2. Authenticate Wrangler: `npx wrangler login` (or `wrangler login`)
3. (Optional) Change Worker name in `wrangler.toml`

## Deploy

- `npm run deploy:cf` (or `yarn deploy:cf`)

## Local preview

- `npm run dev:cf` (or `yarn dev:cf`)
- Open `http://127.0.0.1:8787`

## Notes

- This is a static site deployment (no SSR / middleware at runtime).
- Custom domains/routes are configured in the Cloudflare dashboard (or via Wrangler if you prefer).

