import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion uses some Node APIs that need to be handled
  serverExternalPackages: ["remotion", "@remotion/player", "@remotion/media"],
};

export default nextConfig;
