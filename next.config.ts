import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow large video file uploads
  serverExternalPackages: ['@anthropic-ai/sdk'],
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  // Force resolution from project directory (fixes resolution from parent videocut-skills)
  webpack: (config, { dir }) => {
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.resolve(dir, 'node_modules'),
      'node_modules',
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : []),
    ];
    return config;
  },
};

export default nextConfig;
