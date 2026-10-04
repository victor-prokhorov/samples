// The language switch: remember the choice in a cookie and go back to the page it was made on.
import { type NextRequest, NextResponse } from "next/server";
import { APP } from "@/config";
import { isLocale } from "@/lib/i18n";
import { localPath } from "@/lib/oidc";
import { currentUser, track } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const back = localPath(req.headers.get("referer"));
  const res = NextResponse.redirect(new URL(back, APP), 303);
  if (!isLocale(to)) return res;
  res.cookies.set("lang", to, { sameSite: "lax", path: "/", maxAge: 365 * 24 * 3600 });
  const user = await currentUser();
  if (user) await track(user, "language_switched", { to });
  return res;
}
