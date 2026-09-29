import { addToCart, type CartLine } from './shopify';
import type { Viewer } from './viewer';

interface CartUiOptions {
  viewer: Viewer;
  line: () => CartLine;
  filename: () => string;
}

/**
 * Wires the "Add to cart" and "Save design" buttons shared by every configurator page.
 * Expects #add-to-cart, #save-design, #cart-status and the #cart-dialog markup.
 */
export function mountCart({ viewer, line, filename }: CartUiOptions) {
  const addBtn = document.getElementById('add-to-cart') as HTMLButtonElement;
  const saveBtn = document.getElementById('save-design') as HTMLButtonElement;
  const status = document.getElementById('cart-status')!;
  const dialog = document.getElementById('cart-dialog') as HTMLDialogElement;
  const code = dialog.querySelector('code')!;
  const preview = dialog.querySelector('img')!;

  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    status.textContent = '';
    try {
      const result = await addToCart(line());
      if (result.mode === 'shopify') {
        status.textContent = 'Added to your cart.';
      } else {
        const { url, init } = result.request;
        code.textContent = `POST ${url}\n\n${JSON.stringify(JSON.parse(init.body), null, 2)}`;
        preview.src = viewer.snapshot();
        dialog.showModal();
      }
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not add to cart.';
    } finally {
      addBtn.disabled = false;
    }
  });

  saveBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = viewer.snapshot();
    a.download = filename();
    a.click();
  });

  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
}
