import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        // Ensure pdf.worker.js is served with correct MIME type
        source: '/pdf.worker.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Ignore canvas module for client-side builds (pdfjs-dist uses it for Node.js only)
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = config.resolve.fallback || {};
      config.resolve.fallback.canvas = false;
      config.resolve.fallback.fs = false;

      // Also add as external
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('canvas');
      }
    }
    return config;
  },
};

export default nextConfig;
