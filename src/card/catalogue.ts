/**
 * Product data for the NFC card configurator. Materials, pack sizes, prices, SKUs and
 * variant ids mirror the live Rizely NFC range on Shopify (shop.rizely.net).
 * Colour, finish and personalisation travel as line-item properties, so the store
 * only needs one variant per material × pack size.
 */

export type MaterialId = 'pvc' | 'metal' | 'wood';

export interface Tone {
  id: string;
  label: string;
  /** Base colour. For wood: [light, dark] grain colours. */
  color: string | [string, string];
  /** Colour of printed / engraved text on this tone. */
  ink: string;
}

export interface Surface {
  id: string;
  label: string;
}

export interface Pack {
  qty: number;
  price: number;
  sku: string;
  variantId: number;
}

export interface Material {
  id: MaterialId;
  label: string;
  note: string;
  toneLabel: string;
  tones: Tone[];
  surfaceLabel?: string;
  surfaces?: Surface[];
  /** Visual thickness in scene units (exaggerated slightly so the edge reads). */
  thickness: number;
  mode: 'print' | 'engrave';
  packs: Pack[];
}

export const MATERIALS: Material[] = [
  {
    id: 'pvc',
    label: 'PVC',
    note: 'Full-colour print',
    toneLabel: 'Colour',
    tones: [
      { id: 'midnight', label: 'Midnight', color: '#15171b', ink: '#f2f1ec' },
      { id: 'white', label: 'Pearl white', color: '#f3f2ee', ink: '#1a1c20' },
      { id: 'ocean', label: 'Ocean', color: '#1d4a73', ink: '#f2f1ec' },
      { id: 'coral', label: 'Coral', color: '#e0664b', ink: '#fff8f2' },
      { id: 'forest', label: 'Forest', color: '#1f5a45', ink: '#f2f1ec' },
      { id: 'lilac', label: 'Lilac', color: '#b8a7d9', ink: '#1d1830' },
    ],
    surfaceLabel: 'Finish',
    surfaces: [
      { id: 'gloss', label: 'Gloss' },
      { id: 'matte', label: 'Soft-touch matte' },
    ],
    thickness: 0.09,
    mode: 'print',
    packs: [
      { qty: 1, price: 599, sku: 'CP-NFC-PVC-1', variantId: 50553158992120 },
      { qty: 10, price: 5490, sku: 'CP-NFC-PVC-10', variantId: 50553159024888 },
      { qty: 25, price: 12475, sku: 'CP-NFC-PVC-25', variantId: 50553159057656 },
      { qty: 50, price: 22450, sku: 'CP-NFC-PVC-50', variantId: 50553159090424 },
      { qty: 100, price: 39900, sku: 'CP-NFC-PVC-100', variantId: 50553159123192 },
    ],
  },
  {
    id: 'metal',
    label: 'Metal',
    note: 'Laser-engraved steel',
    toneLabel: 'Finish',
    tones: [
      { id: 'steel', label: 'Brushed steel', color: '#c9ccd1', ink: '#6f737a' },
      { id: 'black', label: 'Black steel', color: '#232529', ink: '#a7abb2' },
      { id: 'gold', label: 'Gold', color: '#d9b25e', ink: '#8a6726' },
      { id: 'rose', label: 'Rose gold', color: '#dc9f8b', ink: '#8c5444' },
    ],
    surfaceLabel: 'Surface',
    surfaces: [
      { id: 'brushed', label: 'Brushed' },
      { id: 'mirror', label: 'Mirror' },
    ],
    thickness: 0.1,
    mode: 'engrave',
    packs: [
      { qty: 1, price: 1999, sku: 'CP-NFC-MTL-1', variantId: 50553159155960 },
      { qty: 10, price: 18990, sku: 'CP-NFC-MTL-10', variantId: 50553159188728 },
      { qty: 25, price: 44975, sku: 'CP-NFC-MTL-25', variantId: 50553159221496 },
      { qty: 50, price: 84950, sku: 'CP-NFC-MTL-50', variantId: 50553159254264 },
    ],
  },
  {
    id: 'wood',
    label: 'Wood',
    note: 'Laser-engraved wood',
    toneLabel: 'Wood',
    tones: [
      { id: 'walnut', label: 'Walnut', color: ['#6b462c', '#2f1b0e'], ink: '#1a0d05' },
      { id: 'cherry', label: 'Cherry', color: ['#9a5a3c', '#50261a'], ink: '#200d06' },
      { id: 'bamboo', label: 'Bamboo', color: ['#d4b383', '#94703f'], ink: '#2e1b0c' },
    ],
    thickness: 0.15,
    mode: 'engrave',
    packs: [
      { qty: 1, price: 899, sku: 'CP-NFC-WD-1', variantId: 50553158795512 },
      { qty: 10, price: 8490, sku: 'CP-NFC-WD-10', variantId: 50553158828280 },
      { qty: 25, price: 19975, sku: 'CP-NFC-WD-25', variantId: 50553158861048 },
      { qty: 50, price: 37450, sku: 'CP-NFC-WD-50', variantId: 50553158893816 },
    ],
  },
];

export const material = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
export const tone = (m: Material, id: string) => m.tones.find((t) => t.id === id) ?? m.tones[0];
export const surface = (m: Material, id: string) => m.surfaces?.find((s) => s.id === id) ?? m.surfaces?.[0];
export const pack = (m: Material, qty: number) => m.packs.find((p) => p.qty === qty) ?? m.packs[0];

/** CSS preview for a swatch. */
export function swatchCss(m: Material, t: Tone) {
  if (Array.isArray(t.color)) return `repeating-linear-gradient(170deg, ${t.color[0]} 0 5px, ${t.color[1]} 5px 7px)`;
  if (m.id === 'metal') return `linear-gradient(135deg, ${t.color}, #ffffff66 45%, ${t.color} 60%)`;
  return t.color;
}
