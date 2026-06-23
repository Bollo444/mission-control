import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Anchor file-tracing to the project root so Next.js doesn't walk AppData
  // symlink junctions (Application Data → AppData\Local) on Windows.
  outputFileTracingRoot: __dirname,
  // node-pty is a native module; sql.js ships a wasm file that must be
  // resolved at runtime — keep both out of the webpack bundle.
  serverExternalPackages: ["@lydell/node-pty", "sql.js"],
  // The dashboard reads local config files and spawns local CLIs, so it is
  // intended to run only on the loopback interface during local development.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
