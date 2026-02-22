import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Diary App",
        short_name: "Diary",
        start_url: "/diary-app/",
        scope: "/diary-app/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "/diary-app/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/diary-app/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
  base: "/diary-app/",
});