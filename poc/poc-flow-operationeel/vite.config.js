import { defineConfig } from 'vite'

/**
 * `base: './'` keeps every asset URL relative. The POC is deployed as a
 * subfolder of the GitHub Pages site (`.../codelijst-rie-iepr/operationeel/`,
 * see Jenkinsfile.groovy), next to the landing page and the structuur-POC.
 * Relative URLs also keep the Vite dev server at `/`.
 */
export default defineConfig({
  base: './',
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
