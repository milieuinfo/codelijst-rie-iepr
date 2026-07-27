import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  resolve: {
    alias: {
      '@src': '/src',
      '@utils': '/src/utils',
      '@services': '/src/services',
      '@models': '/src/models',
      '@components': '/src/components'
    }
  }
})
