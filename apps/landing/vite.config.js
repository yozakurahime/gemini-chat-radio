import { defineConfig } from 'vite';

export default defineConfig({
  base: '/landing-assets/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5175,
    strictPort: true
  }
});

