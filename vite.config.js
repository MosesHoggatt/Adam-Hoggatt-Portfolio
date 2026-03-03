import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// VITE_BASE_PATH is set to /Adam-Hoggatt-Portfolio/ by the GitHub Actions workflow
// so assets resolve correctly on GitHub Pages. Amplify / local dev leave it unset (defaults to /).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})