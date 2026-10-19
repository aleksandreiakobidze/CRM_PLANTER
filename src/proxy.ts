import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login$/, /^\/invite\//, /^\/care\//, /^\/api\/health$/];

export function proxy(request: NextRequest) {
  const token = request.cookies.get("planter_session")?.value;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((pattern) => pattern.test(path));
  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
