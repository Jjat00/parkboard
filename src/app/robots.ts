import type { MetadataRoute } from "next";
import { SITE } from "@/lib/llms";

export default function robots(): MetadataRoute.Robots {
  // Public: the landing, the privacy page, the descriptions and setup steps for language models, the sitemap
  // (a sitemap blocked here is one Google refuses to read) and the assets the landing needs to
  // render. The board and the API sit behind sign-in.
  const allow = ["/$", "/privacy", "/llms.txt", "/llms-full.txt", "/setup.md", "/sitemap.xml", "/_next/static/", "/_next/image", "/screenshot.png", "/icon.svg", "/apple-icon.png"];
  return {
    rules: { userAgent: "*", allow, disallow: "/" },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
