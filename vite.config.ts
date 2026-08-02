import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],

  // GitHub Pages serves this from /<repo>/, not from the domain root. Emitting
  // relative asset paths makes the build work under any sub-path without
  // hard-coding the repository name — but only at build time, since the dev
  // server always runs at the root.
  base: command === 'build' ? './' : '/',

  // Vite does not read PORT on its own; honouring it lets a supervising tool
  // assign a free port instead of silently landing on 5174 when 5173 is taken.
  server: { port: Number(process.env.PORT) || 5173 },

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
