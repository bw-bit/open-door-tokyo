import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: false,
  serverExternalPackages: ["@daytona/sdk", "@nosana/kit"]
};

export default nextConfig;
