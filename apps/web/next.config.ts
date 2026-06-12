import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@risk2/engine"],
  // The engine uses ESM ".js" import specifiers for its ".ts" sources.
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return config;
  },
};

export default nextConfig;
