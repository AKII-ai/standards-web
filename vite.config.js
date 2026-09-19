import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/egov": {
        target: "https://laws.e-gov.go.jp",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/egov/, "/api/2"),
      },
    },
  },
});
