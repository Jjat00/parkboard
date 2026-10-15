import type { MetadataRoute } from "next";
import { SITE } from "@/lib/llms";

export default function robots(): MetadataRoute.Robots {
  // Public: the landing, the privacy page and the descriptions for language models. The board
  // and the API sit behind sign-in.
  return {
    rules: { userAgent: "*", allow: ["/$", "/privacy", "/llms.txt", "/llms-full.txt"], disallow: "/" },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
