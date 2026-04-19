import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@weather/shared"],
};

export default nextConfig;
