/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DECK = fileURLToPath(new URL("./presentation/index.html", import.meta.url));

// The deck is a self-contained page (assets and fonts inlined), so it is copied verbatim rather than run through Vite.
function slidesPage(): Plugin {
  return {
    name: "receptorlens-slides",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/slides") {
          res.statusCode = 302;
          res.setHeader("Location", "/slides/");
          res.end();
          return;
        }
        if (path !== "/slides/" && path !== "/slides/index.html") return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(readFileSync(DECK));
      });
    },
    buildStart() {
      this.addWatchFile(DECK);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "slides/index.html", source: readFileSync(DECK) });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), slidesPage()],
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
