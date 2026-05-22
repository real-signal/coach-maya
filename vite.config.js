import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Pre-bundling these on first dev-server boot prevents Vite's optimizer
// from rotating dep hashes mid-session — which would cause two copies of
// React to load in the page (→ "Invalid hook call" / null useContext).
const PRE_BUNDLE = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-router-dom',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      'react-router-dom': path.resolve('./node_modules/react-router-dom'),
    },
  },
  optimizeDeps: {
    include: PRE_BUNDLE,
  },
  build: {
    // Push the 500KB-chunk warning up so the build log isn't spammy while we
    // keep an eye on real growth.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Only split three.js (the heaviest dep) into its own chunk.
        // Previously we split react / react-dom / react-router into separate
        // chunks with a `vendor` catch-all — but React internal peers like
        // `scheduler` and `use-sync-external-store` ended up in `vendor` and
        // called React hooks at module-eval time, before the `react` chunk
        // had finished initializing → "Cannot read properties of undefined
        // (reading 'useLayoutEffect')" → React never mounted → blank app.
        // Letting Rollup auto-split everything except three keeps init order
        // safe; lazy() routes still get their own chunks.
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  server: {
    // Fail loudly if 5173 is taken instead of silently moving to 5174 —
    // because moving ports leaves HMR pointed at the wrong place (we saw
    // `ws://localhost:undefined/` in the crash logs).
    port: 5173,
    strictPort: true,
    // Pin HMR so it can't end up with an undefined client port.
    hmr: { protocol: 'ws', host: 'localhost', port: 5173, clientPort: 5173 },
  },
})
