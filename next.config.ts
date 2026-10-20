import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The page that hands a key to the terminal must never load inside another site's frame.
  async headers() {
    return [
      {
        source: "/cli/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      // irm hands PowerShell a string only for text; as a binary download `| iex` would fail.
      { source: "/install.ps1", headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }] },
    ];
  },
};

export default nextConfig;
