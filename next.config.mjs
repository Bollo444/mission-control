/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // node-pty is a native module — keep it out of the webpack bundle so the
  // route requires the platform-specific binary from node_modules at runtime.
  serverExternalPackages: ["@lydell/node-pty"],
  // The dashboard reads local config files and spawns local CLIs, so it is
  // intended to run only on the loopback interface during local development.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
