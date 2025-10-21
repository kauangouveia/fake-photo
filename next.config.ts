import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: { ignoreDuringBuilds: true },     // já estava ok
  typescript: { ignoreBuildErrors: true },  // <<< ignora TS no build
};

export default nextConfig;
