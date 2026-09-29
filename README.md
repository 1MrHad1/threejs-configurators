# Three.js product configurators

Two 3D product configurators for e-commerce, built with **Three.js** and **TypeScript**, with a
**Shopify** cart integration. Personal projects by Haseeb Ahmed Danish.

| Configurator | What you can configure |
| --- | --- |
| **NFC business card** (`/card/`) | Material (PVC, metal, wood) · colour or metal finish · wood species · gloss/matte or brushed/mirror surface · name, title, company · uploaded logo · layout · pack size (1–100) with live pricing |
| **Lounge chair** (`/chair/`) | Legs (tapered wood, hairpin steel, swivel base) · arms on/off · lumbar pillow on/off/contrast · upholstery (bouclé, velvet, leather) · colour · wood and metal finishes · three sizes with live dimensions |

## Features

| Feature | Where |
| --- | --- |
| Colour, material, texture and finish switching (PBR `MeshPhysicalMaterial`: clearcoat, sheen, metalness, roughness maps) | `src/card/card.ts`, `src/chair/main.ts` |
| Part switching: variants and optional parts, with animated transitions | `src/chair/main.ts` (`apply`, `toggle`) |
| Size changes that resize the model and update dimensions | `src/chair/main.ts` |
| GLTF/GLB assets and optimisation: dedup, weld, quantise and meshopt compression, 747 KB → 72 KB | `scripts/build-chair.mjs` |
| Camera controls, animated camera presets and hotspots (occlusion-aware, driven by glTF data) | `src/shared/viewer.ts` |
| Shopify integration: variant plus line-item properties to `/cart/add.js`, variant IDs looked up by SKU from product JSON, Liquid section and theme build | `src/shared/shopify.ts`, `shopify/sections/`, `vite.theme.config.ts` |
| Desktop and mobile: responsive layout, touch orbit and pinch, sticky 3D stage on phones | `src/shared/configurator.css` |

### How it's built

- **Render on demand.** A frame is drawn only when the camera, a tween or an option changes, so an idle
  configurator uses no GPU. The chair renders in 8 draw calls (`?debug` shows live stats).
- **Colour-accurate tone mapping.** Khronos PBR Neutral (`NeutralToneMapping`) keeps rendered colours
  close to the swatches, which ACES doesn't.
- **Data-driven model.** The runtime reads `extras` on glTF nodes (`slot`, `part`, `variant`, `hotspot`)
  instead of hard-coding mesh names. A model re-exported from Blender with the same custom properties
  works unchanged.
- **Quantisation-safe transforms.** Meshopt quantisation stores the dequantise factor in each node's
  scale and translation. Configurable parts are wrapped in pivot groups, and only the pivots are animated.
- **Engraving with real depth.** Card artwork is drawn to canvases and used as the colour map, bump map
  (so engraved text catches light) and roughness map (brushed streaks, rougher engraving).
- **Procedural textures.** Wood grain, brushed metal and fabric weaves are generated at runtime, so
  there are no texture downloads.
- **Shareable designs.** Every configuration lives in the URL. Saved designs download as PNG.
- **Scoped CSS.** All component styles and tokens sit under `.cfg`, so the configurator can live inside
  any Shopify theme without style clashes.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (index, /card/, /chair/)
npm run build        # regenerates the GLB, type-checks, builds dist/
npm run build:model  # only rebuild public/models/lounge-chair.glb
npm run build:theme  # Shopify theme assets → shopify/assets/
```

## Shopify

Outside Shopify, **Add to cart** opens a preview of the exact request it would send. Inside a theme it
posts to the storefront Cart API:

```json
POST /cart/add.js
{ "items": [{ "id": 50553159188728, "quantity": 1,
  "properties": { "Material": "Metal", "Finish": "Black steel", "Surface": "Brushed",
                  "Name": "…", "Title": "…", "_sku": "CP-NFC-MTL-10", "_config": "https://…" } }] }
```

To install the card configurator in a theme:

1. `npm run build:theme`, then upload `shopify/assets/nfc-card-configurator.js` and `.css` to the theme's assets.
2. Copy `shopify/sections/nfc-card-configurator.liquid` into `sections/` and add the section to the product template.
3. Give each variant the SKU from `src/card/catalogue.ts`. Variant IDs are resolved from `{{ product.variants | json }}` by SKU.

The card catalogue (materials, pack sizes, prices, SKUs) mirrors the Rizely NFC range on Shopify.
The chair uses demo pricing and placeholder variant IDs.

## Structure

```
index.html, card/, chair/      pages (Vite multi-page)
src/shared/viewer.ts           renderer, environment, controls, render-on-demand, camera tweens, hotspots
src/shared/textures.ts         procedural wood / brushed metal / fabric textures
src/shared/shopify.ts          cart request, SKU → variant lookup
src/shared/ui.ts, cart-ui.ts   option groups, URL state, add-to-cart and save
src/card/                      card catalogue, geometry and artwork, page wiring
src/chair/                     chair catalogue, GLB loading, part and variant logic
scripts/build-chair.mjs        parametric chair → tagged, optimised GLB
shopify/sections/              Liquid section for a theme
```

MIT licence.
