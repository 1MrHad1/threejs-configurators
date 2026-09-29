# CLAUDE.md

Three.js product configurators (NFC card, lounge chair). Vite multi-page, TypeScript, no framework.

## Commands
- `npm run dev`, then `/card/` and `/chair/`. Add `?debug` on the chair for draw-call stats.
- `npm run build` must pass (regenerates the GLB, type-checks, builds).
- `npm run build:theme` builds the Shopify theme assets.

## Rules
- Call `viewer.invalidate()` after any scene change. Rendering is on demand, and `viewer.tween()` keeps frames coming while it runs.
- Never write to glTF node transforms on the chair. Meshopt quantisation lives there, so animate the pivot groups.
- Model behaviour comes from glTF `extras` (`slot`, `part`, `variant`, `hotspot`) set in `scripts/build-chair.mjs`.
- Component CSS stays scoped under `.cfg`, including tokens, so it can be embedded in Shopify themes. Page chrome goes in `page.css`.
- Keep `NeutralToneMapping` so colours match their swatches.
- Card prices, SKUs and variant IDs mirror the live Rizely catalogue. The chair's are demo values, so say so wherever they're shown.
