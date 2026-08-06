import { defineConfig } from 'vite'

export default defineConfig({
  base: '/codelijst-rie-iepr/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  resolve: {}
})
