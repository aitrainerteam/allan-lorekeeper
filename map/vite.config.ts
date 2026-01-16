import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/map-assets/',
  server: {
    watch: {
      // Watch for changes in all files
      usePolling: false, // Set to true if you have issues with file watching
      interval: 100, // Polling interval in ms (only if usePolling is true)
    },
    hmr: {
      // Enable Hot Module Replacement
      overlay: true, // Show errors in the browser
    },
    // Auto-open browser (optional)
    open: false,
  },
  // Ensure all file changes trigger rebuilds
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'd3-delaunay'],
  },
})
