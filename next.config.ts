import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Job description uploads (PDF/DOCX/TXT) can be a few MB; default is 1MB.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
