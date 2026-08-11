import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The host references dist/index.js and dist/index.css by name when it builds
// the webview HTML, so hashed filenames are turned off. Nothing caches these -
// they are read from disk inside the extension.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // A webview has no module loader and a strict CSP; one classic script is
    // the only shape that loads under a nonce.
    modulePreload: false,
    rollupOptions: {
      // The host writes the HTML itself - it has to, since every local URI must
      // go through asWebviewUri and the CSP nonce changes per panel. So the
      // entry is the script, not a page.
      input: 'src/main.tsx',
      output: {
        format: 'iife',
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
      },
    },
  },
});
