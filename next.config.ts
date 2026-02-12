import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large video file uploads
  serverExternalPackages: ['@anthropic-ai/sdk'],
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

export default nextConfig;
