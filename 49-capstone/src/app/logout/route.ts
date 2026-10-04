import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { APP } from "@/config";
import { pool } from "@/lib/db";
import { sha256 } from "@/lib/request";

export const dynamic = "force-dynamic";

// POST only (a form button), so a link or an image on another site cannot sign anyone out.
export async function POST() {
  const sid = (await cookies()).get("sid")?.value;
  if (sid) await pool.query("DELETE FROM sessions WHERE id_hash = $1", [sha256(sid)]);
  const res = NextResponse.redirect(new URL("/", APP), 303);
  res.cookies.set("sid", "", { path: "/", maxAge: 0 });
  return res;
}
