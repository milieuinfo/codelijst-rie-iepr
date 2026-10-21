import { defineConfig } from 'vite'

/**
 * `base: './'` keeps every asset URL relative. The POC is deployed as a
 * subfolder of the GitHub Pages site (`.../codelijst-rie-iepr/structuur/`,
 * see Jenkinsfile.groovy), next to the landing page and the operationele-POC.
 * Relative URLs also keep the Vite dev server at `/`.
 */
export default defineConfig({
  base: './',
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
