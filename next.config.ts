import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The server reads the places dataset at runtime (detail pages, API routes);
  // make sure it's bundled with every server function when deployed.
  outputFileTracingIncludes: {
    "/**": ["./public/data/places.geojson"],
  },
  // Photos come from Wikimedia Commons.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "upload.wikimedia.org" }],
  },
};

export default nextConfig;
