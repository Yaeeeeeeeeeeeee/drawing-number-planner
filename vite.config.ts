import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  server: { proxy: { '/api': 'http://127.0.0.1:4317' } },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
