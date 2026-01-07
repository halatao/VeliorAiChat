import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/entry-cdn.tsx',
      name: 'VeliorAiChat',
      fileName: 'velior-ai-chat',
      formats: ['iife'],
    },
    // ensure CSS is output and has a predictable filename so embed examples can load it
    cssCodeSplit: true,
    rollupOptions: {
      // do not externalize react so the IIFE bundle is standalone for CDN usage
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'velior-ai-chat.css';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    },
  // Replace common `process.env.NODE_ENV` uses so the IIFE bundle doesn't reference `process` at runtime
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
})
