import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    // Railway assigns PORT at runtime; host 0.0.0.0 so the container is reachable.
    host: true,
    allowedHosts: true,
  },
});
