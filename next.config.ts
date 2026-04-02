import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ui-avatars.com",
        pathname: "/api/**",
      },
      {
        protocol: "https",
        hostname: "**.digitaloceanspaces.com",
        pathname: "/**",
      },
    ],
  },
  // Allow HMR / dev assets when tunneling (e.g. ngrok). Add each hostname without protocol.
  // When your ngrok URL changes, update this list and restart `npm run dev`.
  allowedDevOrigins: [
    "joesph-nonalliterative-nelida.ngrok-free.dev",
    "*.ngrok-free.dev",
  ],
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/brand-logo.png",
        permanent: false,
      },
    ];
  },
};

export default withSerwist(nextConfig);
