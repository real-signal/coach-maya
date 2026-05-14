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
