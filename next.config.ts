import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Minimal config for memory-constrained builds
  productionBrowserSourceMaps: false,
  output: 'standalone',
  // Reduce memory usage during build
  experimental: {
    // Disable parallel builds to reduce memory usage
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
