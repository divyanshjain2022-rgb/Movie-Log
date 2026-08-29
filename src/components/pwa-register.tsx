"use client";

import { useEffect } from "react";

// Registers the service worker after the page has settled, so it never
// competes with the first render for bandwidth.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").then(
        (registration) => {
          // A worker sitting in "waiting" means a new build is live but the
          // old one is still serving. Take it immediately.
          if (registration.waiting) registration.waiting.postMessage("skip-waiting");
        },
        () => {
          // A failed registration is not worth surfacing: the app works
          // without it, and the only cost is no offline card.
        }
      );
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
