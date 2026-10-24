import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180, proxy: {
    '/api': process.env.PORTALNODE_API ?? 'http://127.0.0.1:8080',
    '/mainnet': { target: process.env.PORTALNODE_MAINNET_API ?? 'http://127.0.0.1:8081', rewrite: (p) => p.replace(/^\/mainnet/, '') },
  } },
});
