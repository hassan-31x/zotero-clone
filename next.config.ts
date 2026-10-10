import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["mongodb", "pdfjs-dist"],
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "52mb" } },
};
export default config;
