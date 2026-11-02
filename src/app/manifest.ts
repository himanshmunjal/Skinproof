import type { MetadataRoute } from "next";

// Installable on a phone home screen (DECISION D-41): scans happen in front of a mirror, not at a laptop.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SkinProof",
    short_name: "SkinProof",
    description: "Is your skincare actually working? Noise-calibrated skin scans and 28-day product trials.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f5f1",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
