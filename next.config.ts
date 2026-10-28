import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The server reads the landmarks, the sample places tiles and the city list
  // at runtime (place pages, API routes): bundle them with every server function.
  outputFileTracingIncludes: {
    "/**": ["./public/data/places.geojson", "./public/data/cities.json", "./data/tiles/places.pmtiles"],
  },
  // Photos come from Wikimedia Commons.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "upload.wikimedia.org" }],
  },
};

export default nextConfig;
