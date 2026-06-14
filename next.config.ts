import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 800, // Poll every 800ms
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  // Set an empty turbopack config to silence the error and enable webpack fallback
  turbopack: {},
};

export default nextConfig;
