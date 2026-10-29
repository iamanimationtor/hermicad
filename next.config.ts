import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  // PGlite ships a WASM build; keep it out of the bundler and load it at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
