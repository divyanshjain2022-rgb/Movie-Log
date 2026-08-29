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
  async headers() {
    return [
      {
        // A cached service worker is a stuck service worker: the browser would
        // keep serving the old policy long after a deploy replaced it.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        // Content-hashed filenames, so this is safe and saves a revalidation
        // round trip on every repeat visit.
        source: "/:icon(icon-192|icon-512|icon-maskable-512|apple-icon-180|favicon-96).png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, immutable" }],
      },
    ];
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
