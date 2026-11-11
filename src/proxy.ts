import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// Auth checks live in each page and route handler (see src/lib/auth.ts).
const clerk = clerkMiddleware();

// The app moved from *.jato.run to *.jjato.com. Browser navigations on the old host are sent to the
// new one; API and CLI requests keep working there, because clients drop the Authorization header
// when they follow a redirect to another domain.
const OLD_SUFFIX = ".jato.run";

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const host = req.headers.get("host") ?? "";
  const isPage = req.method === "GET" && (req.headers.get("accept") ?? "").includes("text/html");
  if (host.endsWith(OLD_SUFFIX) && isPage && !req.nextUrl.pathname.startsWith("/api")) {
    const target = `https://${host.slice(0, -OLD_SUFFIX.length)}.jjato.com${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(target, 308);
  }
  return clerk(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
