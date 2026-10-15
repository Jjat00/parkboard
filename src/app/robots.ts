import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Only the landing and the privacy page are public.
  return { rules: { userAgent: "*", allow: ["/$", "/privacy"], disallow: "/" } };
}
