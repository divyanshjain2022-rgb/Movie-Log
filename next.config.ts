import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: back/forward navigation within 30s re-renders the
    // last server payload instantly instead of refetching; a reload or a
    // navigation after the window gets fresh data.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
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
