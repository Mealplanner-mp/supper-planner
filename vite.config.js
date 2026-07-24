import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Plan to Dish",
        short_name: "Plan to Dish",
        description: "Your all-in-one meal planner — recipes, weekly planning, and grocery lists.",
        theme_color: "#0F9D63",
        background_color: "#F6F7F4",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Only the app shell (JS/CSS/HTML/icons) gets cached for offline
        // opening. Supabase/Stripe requests are intentionally never cached
        // here, so data is always fresh when online — offline just means
        // the app opens but can't load/save data, by design.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
      },
    }),
  ],
});
