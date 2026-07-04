import { defineConfig } from 'vite';

// `base: './'` keeps every asset/entry URL relative so one production build
// runs unmodified from:
//   - a plain web server (itch.io / browser build),
//   - an Electron or Tauri shell (Steam desktop), and
//   - a Capacitor WebView (Android / Play Store),
// all of which load index.html from a file:// or app:// origin, not a domain root.
export default defineConfig({
  base: './',
  server: {
    port: 8080, // matches .vscode/launch.json ("Launch Chrome against localhost:8080")
    open: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0, // never inline sprite PNGs as data URIs — keep them as files
  },
});
