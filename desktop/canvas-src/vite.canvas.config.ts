import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const src = resolve(__dirname, "src");
const mocks = resolve(__dirname, "mocks");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": src,
      "next-intl": resolve(mocks, "next-intl.ts"),
      "next/navigation": resolve(mocks, "next-navigation.tsx"),
      "next/link": resolve(mocks, "next-link.tsx"),
      "@/hooks/use-locale-path": resolve(mocks, "use-locale-path.ts"),
      "@/stores/dag-store": resolve(mocks, "dag-store.ts"),
      "@/lib/upload-client": resolve(mocks, "upload-client.ts"),
      "next-auth/react": resolve(mocks, "next-auth-react.ts"),
      "@/lib/auth": resolve(mocks, "next-auth-react.ts"),
    },
  },
  base: "./",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "../studio/canvas-bundle"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
  },
  server: {
    port: 5199,
  },
});
