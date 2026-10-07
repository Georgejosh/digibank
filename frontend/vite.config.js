import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Lets every file import from '@/...' instead of '../../../'.
      // import.meta.url rather than __dirname: this config is an ES module.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false, // don't hijack a browser window on every dev start

    // Proxy the API through the dev server so the browser sees ONE origin.
    //
    // Why this is not optional: the refresh token is a SameSite cookie. Calling
    // Django directly on http://127.0.0.1:8000 from http://localhost:5173 is a
    // cross-site request - "localhost" and "127.0.0.1" count as different sites
    // - so the browser refuses to attach that cookie to the XHR and every
    // silent refresh 401s. Serving the API under the app's own origin makes the
    // cookie first-party, which is also how this gets deployed.
    //
    // Removing CORS and preflights from development is a free side effect.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: false, // keep the Host header so the cookie stays first-party
      },
    },
  },
  build: {
    // Route-level code splitting is done with React.lazy in src/routes.
    // These manual chunks keep the shared vendor code in stable files so a
    // feature change does not invalidate the whole vendor bundle on redeploy.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query', 'axios'],
          'form-vendor': ['react-hook-form', 'zod', '@hookform/resolvers/zod'],
        },
      },
    },
  },
});
