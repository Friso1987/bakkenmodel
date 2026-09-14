import { defineConfig } from 'vitest/config'

// Statische build naar /docs, zodat GitHub Pages die map kan serveren.
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    // ExcelJS is nu eenmaal groot. Het zit in een eigen brok die pas geladen
    // wordt als er echt een bestand gemaakt moet worden.
    chunkSizeWarningLimit: 1200,
  },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
})
