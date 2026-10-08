import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { basePath } from "./lib/site.ts";

const config: NextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default createMDX()(config);
