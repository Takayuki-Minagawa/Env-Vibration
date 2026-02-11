import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const basePath =
  process.env.VITE_BASE_PATH ??
  (repositoryName ? `/${repositoryName}/` : '/')

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [react()],
  build: {
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
  },
})
