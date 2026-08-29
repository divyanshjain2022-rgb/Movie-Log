import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. The layout used to point at
// /manifest.json, which never existed — the browser got the login redirect
// instead of JSON, so the app was never actually installable.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CinemaLog",
    short_name: "CinemaLog",
    description: "Personal cinema tracking with ticket OCR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log a movie", short_name: "Log", url: "/movies/new" },
      { name: "Tonight's picks", short_name: "Tonight", url: "/recommendations" },
      { name: "Watchlist", short_name: "Watchlist", url: "/watchlist" },
    ],
  };
}
