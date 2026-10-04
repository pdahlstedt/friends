import type { NextConfig } from 'next';

// Security headers and CSP are set per request in src/proxy.ts (spec 0001, T5).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the project root; a stray lockfile in a parent directory must not change tracing.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  reactStrictMode: true,
};

export default nextConfig;
