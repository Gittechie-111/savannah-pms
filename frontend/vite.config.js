import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // This is the KEY link — any request to /api/* from React
      // gets forwarded to the FastAPI backend on port 8000
      '/api': {
        target: 'https://savannah-backend-kcxm.onrender.com',
        changeOrigin: true,
      }
    }
  }
})
