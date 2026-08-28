import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['lib/types/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  deps: { neverBundle: ['electron'] },
  fixedExtension: false,
  dts: false,
  clean: false,
})
