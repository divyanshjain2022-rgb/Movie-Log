import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy TMDB images through /api/img to avoid CORS issues
        // (needed for html2canvas in shareable cards)
        source: "/api/img/:path*",
        destination: "https://image.tmdb.org/t/p/:path*",
      },
    ];
  },
};

export default nextConfig;
