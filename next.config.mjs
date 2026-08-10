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
  serverExternalPackages: [
    "@lydell/node-pty",
    "sql.js",
    "discord.js",
    "@discordjs/ws",
    "pm2",
    "@modelcontextprotocol/sdk",
    "worker_threads",
  ],
  // The dashboard reads local config files and spawns local CLIs, so it is
  // intended to run only on the loopback interface during local development.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // The edge compiler bundles instrumentation.ts (which lazy-imports the
      // Discord fleet bot). discord.js's pure-ESM sub-packages can't be bundled
      // there, and webpack's default edge external type ('module') emits
      // `module.exports = @discordjs/…` inside a CJS wrapper — invalid JS that
      // the minifier rejects ("Expression expected"). Force a CJS external for
      // the discord packages. Never evaluated in the edge runtime (the
      // register() guard returns early), and identical to the node build's own
      // require() externals.
      config.externals = [
        (ctx, callback) => {
          if (ctx.request === "discord.js" || /^@discordjs\//.test(ctx.request)) {
            callback(null, "commonjs " + ctx.request);
          } else {
            callback();
          }
        },
        ...(config.externals || []),
      ];
      config.externalsPresets = { ...config.externalsPresets, node: true };
      config.externals = [
        ...(config.externals || []),
        /^zlib-sync/,
        /^cross-spawn/,
        /^@discordjs\/ws/,
        /^@discordjs\//,
      ];
    }
    return config;
  },
  async headers() {
    return [
      {
        // Never edge/browser-cache the HTML shell. Behind Cloudflare a stale
        // cached page would still reference the PREVIOUS build's
        // /_next/static/css/<hash>.css — which no longer exists after a deploy
        // — so the stylesheet 404s and every page renders unstyled, i.e. the
        // "everything drifts to the right" symptom. The content-hashed,
        // immutable assets under /_next/ are excluded by the negative lookahead
        // and keep their long-lived `public, max-age=31536000, immutable`
        // cache, so only the page shell is forced to revalidate.
        source: "/((?!_next/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
