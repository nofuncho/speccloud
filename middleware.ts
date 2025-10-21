// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 공개 경로
  const publicPaths = ["/login", "/register", "/api/auth", "/favicon.ico"];
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // /app 보호
  if (pathname.startsWith("/app")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const url = new URL("/login", req.url);
      url.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/register", "/((?!_next/static|_next/image|images|favicon.ico).*)"],
};
