import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        card: resolve(import.meta.dirname, 'card/index.html'),
        chair: resolve(import.meta.dirname, 'chair/index.html'),
      },
    },
    chunkSizeWarningLimit: 900,
  },
  optimizeDeps: { include: ['three', 'gsap'] },
});
