/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  // @ts-expect-error - vitest types are not automatically detected in some environments
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
