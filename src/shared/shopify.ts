/**
 * Shopify cart integration.
 *
 * Inside a Shopify theme (see shopify/sections/*.liquid) the configurator posts to the
 * storefront AJAX Cart API: the chosen variant plus line-item properties describing
 * the configuration. Standalone (this demo site), nothing is sent: the UI shows the
 * exact request it would make.
 */

export interface CartLine {
  /** Shopify variant id (numeric) that carries the price for this configuration. */
  id: number;
  quantity: number;
  /** Shown on the cart, checkout and order. Keys starting with "_" are hidden from the buyer. */
  properties: Record<string, string>;
}

declare global {
  interface Window {
    Shopify?: { routes?: { root?: string } };
    /** Set by the Liquid section: the product's variants, so ids are never hard-coded. */
    __CONFIGURATOR__?: { variants?: { id: number; sku: string | null; available?: boolean }[] };
  }
}

/** Variant id for a SKU from the theme's product JSON, falling back to the catalogue id. */
export function resolveVariantId(sku: string, fallback: number) {
  const match = window.__CONFIGURATOR__?.variants?.find((v) => v.sku === sku);
  return match?.id ?? fallback;
}

export const inShopify = () => !!window.Shopify || document.documentElement.dataset.shopify === 'true';

export function cartRequest(line: CartLine) {
  const root = window.Shopify?.routes?.root ?? '/';
  return {
    url: `${root}cart/add.js`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [line] }),
    } satisfies RequestInit,
  };
}

export type CartResult = { mode: 'shopify'; ok: true } | { mode: 'demo'; request: ReturnType<typeof cartRequest> };

export async function addToCart(line: CartLine): Promise<CartResult> {
  const request = cartRequest(line);
  if (!inShopify()) return { mode: 'demo', request };
  const res = await fetch(request.url, request.init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.description || body.message || `Cart request failed (${res.status})`);
  }
  document.dispatchEvent(new CustomEvent('configurator:added', { detail: line }));
  return { mode: 'shopify', ok: true };
}
