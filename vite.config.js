import { defineConfig } from "vite"
import { resolve } from "node:path"
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import precompileTwig from './src/vite-plugin-precompile-twig.js';

// https://vitejs.dev/config/
export default defineConfig({

  build: {
    lib: {
      entry: {
        test: resolve(__dirname, "tests/fixtures/mockup.twig"),
      },
      name: "vite-plugin-twing-drupal",
      fileName: (_, entry) => `${entry}.js`,
    },
  },
  plugins: [
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'events', 'path'],
    }),
    precompileTwig({
      include: /\.twig(\?.*)?$/     ,      // match bare and query imports.
      namespaces: {
        jabba: ['tests/fixtures/jabba'],
        tests: ['tests/fixtures']
      }
    }),
  ],
  resolve: {
    preserveSymlinks: true,
  },
})
