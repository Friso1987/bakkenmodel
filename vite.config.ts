import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'

/** Korte aanduiding van de build, zodat de uitvoer te herleiden is. */
function buildId(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    return `${new Date().toISOString().slice(0, 10)}-${sha}`
  } catch {
    return 'lokaal'
  }
}

// Statische build naar /docs, zodat GitHub Pages die map kan serveren.
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    // ExcelJS is nu eenmaal groot. Het zit in een eigen brok die pas geladen
    // wordt als er echt een bestand gemaakt moet worden.
    chunkSizeWarningLimit: 1200,
  },
  test: { globals: true, environment: 'node', include: ['tests/**/*.test.ts'] },
})
