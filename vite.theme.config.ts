// Builds the NFC card configurator as theme assets for Shopify:
//   npm run build:theme → shopify/assets/nfc-card-configurator.{js,css}
// Upload both to the theme and add the "NFC card configurator" section to the product template.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'shopify/assets',
    emptyOutDir: false,
    cssCodeSplit: false,
    minify: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/card/main.ts'),
      formats: ['es'],
      fileName: () => 'nfc-card-configurator.js',
      cssFileName: 'nfc-card-configurator',
    },
    rollupOptions: { output: { inlineDynamicImports: true, minify: true } },
    chunkSizeWarningLimit: 900,
  },
});
