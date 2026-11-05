import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/react-leaflet') || id.includes('node_modules/leaflet')) return 'maps';
          if (id.includes('node_modules/@turf')) return 'turf';
          if (id.includes('node_modules/socket.io-client')) return 'realtime';
        },
      },
    },
  },
});
