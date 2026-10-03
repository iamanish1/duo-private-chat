import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// One .env at the repo root serves both apps; Vite only exposes VITE_* to the bundle.
const ENV_DIR = '..';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const appName = env.VITE_APP_NAME || 'Duo';
  const apiTarget = `http://localhost:${env.PORT || 5000}`;

  return {
    envDir: ENV_DIR,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectRegister: false,
        manifest: {
          name: appName,
          short_name: appName,
          description: 'A private space for two.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f6f1ec',
          theme_color: '#f6f1ec',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        },
        devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
      }),
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/socket.io': { target: apiTarget, ws: true },
      },
    },
    preview: { port: 4173 },
    build: { target: 'es2020', sourcemap: false },
    test: { environment: 'node', include: ['src/**/*.test.js'] },
  };
});
