# Three.js product configurators

Two 3D product configurators for e-commerce, built with **Three.js** and **TypeScript**, with a
**Shopify** cart integration. Personal projects by Haseeb Ahmed Danish.

| Configurator | What you can configure |
| --- | --- |
| **NFC business card** (`/card/`) | Material (PVC, metal, wood) · colour or metal finish · wood species · gloss/matte or brushed/mirror surface · name, title, company · uploaded logo · layout · pack size (1–100) with live pricing · **STL / OBJ export for 3D printing** |
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
| Procedural geometry: the card slab is built at runtime with `ExtrudeGeometry` from a parametric rounded-rect profile | `src/card/card.ts` |
| 3D-print export: the configured card rebuilt as a watertight solid with the engraving cut as real geometry, written as binary STL or OBJ | `src/card/printable.ts` |
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
- **Engraving on screen is shading, not geometry.** Card artwork is drawn to canvases and used as the
  colour map, bump map (so engraved text catches light) and roughness map (brushed streaks, rougher
  engraving). That is a lighting trick with nothing behind it, which is fine for a preview and useless
  for a printer. See **3D-printable export** below for what happens when the depth has to be real.
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

## 3D-printable export

**Download STL** / **Download OBJ** on the card page turn whatever is currently configured into a solid
you can hand to a slicer. This is not the preview mesh with a different file extension: the preview fakes
engraving with a bump map, so exporting it would give you a blank slab. `src/card/printable.ts` rebuilds
the card from scratch:

- The card becomes a **height field over a regular grid**, which keeps triangles even enough for small
  type and makes closing the solid trivial. The outer ring of the grid *is* the card outline, so the side
  wall is one strip between the two faces.
- The **same mask canvas that drives the bump map** drives a per-vertex displacement here, so the name,
  title, company and uploaded logo are cut in as real recesses, 0.25 mm deep. Preview and export can
  never disagree about what is engraved, because they read the same source.
- Grid points landing outside a **rounded corner are projected onto the arc**, so the 3.4 mm corner radius
  stays exact. The zero-area triangles that creates are dropped on output.
- Cut depth is clamped to a quarter of the card thickness, and the readout reports the **thinnest
  remaining material**, warning below 0.8 mm. That is the number that fails on a printer rather than in
  the slicer, and it catches the case where both faces are engraved in the same place.
- Winding is verified by **signed volume** and flipped if the mesh came out inside-out. Normals are
  computed per facet for the STL rather than trusted from the geometry.

Output is in millimetres at 85.6 × 54 mm, the ISO/IEC 7810 ID-1 card size. A typical metal card exports
as roughly 207,000 triangles, about 10 MB of binary STL, built in around 100 ms on a laptop.

PVC is printed rather than engraved, so a PVC card correctly exports as a plain slab; the UI says so
instead of silently giving you a blank file.

### Verifying the mesh

The export is only useful if it is manifold, so it is checked rather than assumed:

| Check | Result |
| --- | --- |
| Every edge shared by exactly two triangles, traversed in opposite directions | 0 unmatched |
| Euler characteristic `V − E + F` of the closed surface | 2 (genus 0, no holes) |
| Signed volume | positive, and consistent with the slab minus the engraving |
| STL triangle count in the header vs. byte length | agree |
| Stored facet normals vs. normals recomputed from winding | max error 0 |

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
src/card/printable.ts          configured card → watertight solid → binary STL / OBJ
src/chair/                     chair catalogue, GLB loading, part and variant logic
scripts/build-chair.mjs        parametric chair → tagged, optimised GLB
shopify/sections/              Liquid section for a theme
```

MIT licence.
