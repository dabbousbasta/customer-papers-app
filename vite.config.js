import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/customer-papers-app/',
  plugins: [react()]
})