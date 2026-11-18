import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid concurrent static-output directory writes on Windows. Hosted Linux
  // builds retain Next's normal parallelism.
  ...(process.platform === 'win32' ? {
    experimental: { cpus: 1, staticGenerationMaxConcurrency: 1 },
  } : {}),
};

export default nextConfig;
