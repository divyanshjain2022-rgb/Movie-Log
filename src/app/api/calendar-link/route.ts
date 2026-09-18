import { NextResponse } from "next/server";
import { calendarToken } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/telegram";

// Hands the logged-in user their feed URL. Checked here as well as in the
// middleware, since the URL itself grants read access to the log.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = calendarToken();
  if (!token) {
    return NextResponse.json({ error: "Calendar feed is not configured" }, { status: 503 });
  }
  return NextResponse.json({ url: `${SITE_URL}/api/calendar/${token}` });
}
