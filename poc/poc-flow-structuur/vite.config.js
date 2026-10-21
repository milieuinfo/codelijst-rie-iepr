import { defineConfig } from 'vite'

export default defineConfig({
  base: '/codelijst-rie-iepr-poc-structuur/',
  server: {
    port: 3001,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {},
})
