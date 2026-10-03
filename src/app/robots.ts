import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Only the landing is public.
  return { rules: { userAgent: "*", allow: "/$", disallow: "/" } };
}
