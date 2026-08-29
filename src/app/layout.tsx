import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CinemaLog",
  description: "Personal cinema tracking with ticket OCR",
  // No `manifest` key: app/manifest.ts emits /manifest.webmanifest and Next
  // links it itself. The old hardcoded /manifest.json pointed at nothing.
  applicationName: "CinemaLog",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CinemaLog",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // Matches --background; the old #0d1117 predates the amber/near-black
  // identity and showed as a seam above the app in standalone mode.
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${bebas.variable} font-sans antialiased`}>
        {children}
        <Toaster position="top-center" />
        <PwaRegister />
      </body>
    </html>
  );
}
