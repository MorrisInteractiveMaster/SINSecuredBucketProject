import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy:
      process.env.VITE_LOCAL_PROXY === '1'
        ? {
            '/identitytoolkit.googleapis.com': 'http://127.0.0.1:9099',
            '/securetoken.googleapis.com': 'http://127.0.0.1:9099',
            '/demo-mi-sin-portal/northamerica-northeast1/':
              'http://127.0.0.1:5001',
          }
        : undefined,
    host: '0.0.0.0',
    strictPort: true,
    port: 5173,
  },
});
