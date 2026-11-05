import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works on any static host AND inside Tauri / Electron (file://)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { chunkSizeWarningLimit: 1500 }
});
