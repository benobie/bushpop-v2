/**
 * `/browse` → `/shop` permanent redirect (BF-15). The marketplace namespace
 * moved to `/shop` (BF-14) — this keeps old links and saved searches working.
 * Query params carry over unchanged via `nextUrl.clone()`.
 */
import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/shop";
  return NextResponse.redirect(url, 308);
}
