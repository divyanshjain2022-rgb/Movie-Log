import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ dismissals: [] });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("movie_dismissals")
    .select("id,movie_title,pvr_movie_id,reason,reason_detail,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dismissals: data || [] });
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { movieTitle, pvrMovieId, reasons } = body as {
    movieTitle: string;
    pvrMovieId: string;
    reasons: Array<{ reason: string; reasonDetail?: string | null }>;
  };

  if (!movieTitle || !pvrMovieId || !reasons?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const validReasons = ["language", "genre", "director", "cast", "story", "seen_it", "bad_reviews"];
  const rows = reasons
    .filter((r) => validReasons.includes(r.reason))
    .map((r) => ({
      user_id: user.id,
      movie_title: movieTitle,
      pvr_movie_id: pvrMovieId,
      reason: r.reason,
      reason_detail: r.reasonDetail || null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid reasons provided" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const row of rows) {
    const { data: single, error: singleError } = await supabase
      .from("movie_dismissals")
      .insert(row as never)
      .select("id,movie_title,pvr_movie_id,reason,reason_detail,created_at")
      .single();
    if (!singleError && single) results.push(single);
    // Silently skip if duplicate (unique constraint violation)
  }

  return NextResponse.json({ dismissals: results });
}

export async function DELETE(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pvrMovieId = searchParams.get("pvrMovieId");

  if (!pvrMovieId) {
    return NextResponse.json({ error: "Missing pvrMovieId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("movie_dismissals")
    .delete()
    .eq("user_id", user.id)
    .eq("pvr_movie_id", pvrMovieId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
