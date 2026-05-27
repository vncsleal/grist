import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

const plugins: PluginOption[] = [react(), tailwindcss()];

if (process.env.ANALYZE) {
  plugins.push(
    visualizer({
      open: true,
      filename: "dist/stats.html",
      gzipSize: true,
      brotliSize: true,
    }),
  );
}

export default defineConfig({
  plugins,
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          heroui: ["@heroui/react", "@heroui/styles"],
        },
      },
    },
  },
});
