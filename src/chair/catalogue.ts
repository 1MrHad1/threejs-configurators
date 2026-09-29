/**
 * Options for the lounge chair configurator. This is a demo product: prices and
 * variant ids are placeholders showing the pattern (one Shopify variant per size,
 * everything else as line-item properties).
 */

export interface Option {
  id: string;
  label: string;
  price?: number;
  note?: string;
}

export interface Fabric extends Option {
  kind: 'boucle' | 'velvet' | 'leather';
}

export interface ColourOption extends Option {
  hex: string;
}

export interface Finish extends Option {
  /** Wood: [light, dark] grain colours. Metal: base colour. */
  color: string | [string, string];
  roughness: number;
}

export interface Size extends Option {
  scale: number;
  variantId: number;
  sku: string;
}

export const BASE_PRICE = 32000;

export const FABRICS: Fabric[] = [
  { id: 'boucle', label: 'Bouclé', kind: 'boucle', price: 0, note: 'Looped, textured' },
  { id: 'velvet', label: 'Velvet', kind: 'velvet', price: 2500, note: 'Soft sheen' },
  { id: 'leather', label: 'Leather', kind: 'leather', price: 6500, note: 'Full grain' },
];

export const COLOURS: ColourOption[] = [
  { id: 'oat', label: 'Oat', hex: '#d8cdbb' },
  { id: 'charcoal', label: 'Charcoal', hex: '#3b3c40' },
  { id: 'forest', label: 'Forest', hex: '#2e4b3b' },
  { id: 'terracotta', label: 'Terracotta', hex: '#b35a3c' },
  { id: 'navy', label: 'Navy', hex: '#26334f' },
  { id: 'cognac', label: 'Cognac', hex: '#8a4f2a' },
];

export const WOODS: Finish[] = [
  { id: 'oak', label: 'Natural oak', color: ['#c9a06c', '#8c6437'], roughness: 0.55 },
  { id: 'walnut', label: 'Walnut', color: ['#6b462c', '#2f1b0e'], roughness: 0.5 },
  { id: 'black', label: 'Black ash', color: ['#2a2826', '#131211'], roughness: 0.45 },
];

export const METALS: Finish[] = [
  { id: 'black', label: 'Black steel', color: '#2b2c30', roughness: 0.42 },
  { id: 'brass', label: 'Brushed brass', color: '#c9a15a', roughness: 0.3 },
  { id: 'chrome', label: 'Chrome', color: '#e6e8eb', roughness: 0.06 },
];

export const LEGS: Option[] = [
  { id: 'tapered', label: 'Tapered wood', price: 0 },
  { id: 'hairpin', label: 'Hairpin steel', price: 1500 },
  { id: 'swivel', label: 'Swivel base', price: 4000 },
];

export const ARMS: Option[] = [
  { id: 'on', label: 'With arms', price: 3000 },
  { id: 'off', label: 'Armless', price: 0 },
];

/** Pillow: none, matching the upholstery, or a contrast colour. */
export const PILLOWS: Option[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'match', label: 'Matching', price: 1200 },
  ...COLOURS.map((c) => ({ id: c.id, label: c.label, price: 1200 })),
];

export const SIZES: Size[] = [
  { id: 's', label: 'Compact', scale: 0.88, price: -2000, variantId: 1000000000001, sku: 'LC-S' },
  { id: 'm', label: 'Standard', scale: 1, price: 0, variantId: 1000000000002, sku: 'LC-M' },
  { id: 'l', label: 'Wide', scale: 1.14, price: 3500, variantId: 1000000000003, sku: 'LC-L' },
];

export const byId = <T extends Option>(list: T[], id: string) => list.find((o) => o.id === id) ?? list[0];
