import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("openseadragon")) return "openseadragon";
          if (id.includes("katex")) return "katex";
          if (id.includes("framer-motion")) return "motion";
        },
      },
    },
  },
});
