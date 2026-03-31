import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'frontend',
  build: {
    outDir: '../assets/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'bundle.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'bundle.css'
          return '[name]-[hash][extname]'
        },
        manualChunks: (id) => {
          if (id.includes('/mermaid/') || id.includes('/node_modules/mermaid')) return 'mermaid'
          if (id.includes('/katex/') || id.includes('rehype-katex')) return 'katex'
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {}],
        ],
      },
    }),
  ],
})
