import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// PWA instalável + disfarce total: nome/ícone de calculadora.
// `base` vem do ambiente: no GitHub Pages é "/<repo>/"; em host de domínio
// raiz (Vercel/Netlify) fica "/". Definido pelo workflow via VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Calculadora",
        short_name: "Calculadora",
        description: "Calculadora científica",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: {
    // Remove nomes de função/variáveis para dificultar a leitura do bundle.
    // (Camada extra — a segurança real é a criptografia E2E, não a ofuscação.)
    minify: "esbuild",
    sourcemap: false,
  },
  esbuild: {
    drop: ["console", "debugger"],
  },
});
