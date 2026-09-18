import { NextResponse } from "next/server";
import { buildCalendar, calendarToken, type CalendarMovie } from "@/lib/calendar";
import { resolveBotUserId, serviceClient, SITE_URL } from "@/lib/telegram";

// Calendar apps poll this without a session; the token in the path is the auth.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const expected = calendarToken();
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = serviceClient();
  const userId = await resolveBotUserId();
  if (!supabase || !userId) {
    return NextResponse.json({ error: "No database access" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("movies")
    .select("id,title,date,showtime,runtime_minutes,audi,seat,rating,theater:theaters(name),format:formats(name)")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(buildCalendar((data || []) as unknown as CalendarMovie[], SITE_URL), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cinemalog.ics"',
      "Cache-Control": "no-store",
    },
  });
}
