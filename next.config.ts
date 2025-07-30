import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure for Netlify deployment with server-side functionality
  images: {
    unoptimized: true
  },
  experimental: {
    esmExternals: true
  }
};

export default nextConfig;
