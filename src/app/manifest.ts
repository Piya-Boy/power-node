import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PowerNode",
    short_name: "PowerNode",
    description: "Workflow Automation Platform",
    start_url: "/mobile",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };
}
