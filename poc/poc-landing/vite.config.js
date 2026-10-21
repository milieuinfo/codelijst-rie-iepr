import { defineConfig } from 'vite'

/**
 * The landing page is deployed at the root of the GitHub Pages site; the two
 * POCs are served from the `operationeel/` and `structuur/` subfolders.
 * `base: './'` keeps every asset URL relative, so the same build works on
 * GitHub Pages (`/codelijst-rie-iepr/`) and behind any other subpath.
 */
export default defineConfig({
  base: './',
  server: {
    port: 3002,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
