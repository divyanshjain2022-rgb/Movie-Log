
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    // 1. Check Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const results = {
        formats: 0,
        moods: 0,
        aspects: 0,
        rewatch: 0,
        theaters: 0,
        platforms: 0
    };

    try {
        // 2. Seed Formats
        const formats = [
            { name: "2D", weight: 1.0, sort_order: 1 },
            { name: "3D", weight: 1.2, sort_order: 2 },
            { name: "IMAX 2D", weight: 1.4, sort_order: 3 },
            { name: "IMAX 3D", weight: 1.6, sort_order: 4 },
            { name: "4DX", weight: 1.5, sort_order: 5 },
            { name: "Dolby Atmos", weight: 1.3, sort_order: 6 },
        ];
        // Need to insert one by one or upsert to avoid conflicts if some exist
        for (const item of formats) {
            const { error } = await supabase.from("formats").insert({
                user_id: userId,
                ...item
            } as never);
            // But standard tables don't usually have unique name constraints per user unless set.
            // We'll rely on checking count or just appending if clean.
            if (!error) results.formats++;
        }

        // 3. Seed Moods (Fixing 'sentiment' column name issue)
        const moods = [
            { name: "Mind-blown", emoji: "🤯", sentiment: "positive", sort_order: 1 },
            { name: "Happy", emoji: "😊", sentiment: "positive", sort_order: 2 },
            { name: "Thrilled", emoji: "🎢", sentiment: "positive", sort_order: 3 },
            { name: "Moved", emoji: "🥹", sentiment: "positive", sort_order: 4 },
            { name: "Satisfied", emoji: "😌", sentiment: "neutral", sort_order: 5 },
            { name: "Meh", emoji: "😐", sentiment: "neutral", sort_order: 6 },
            { name: "Disappointed", emoji: "😞", sentiment: "negative", sort_order: 7 },
            { name: "Bored", emoji: "😴", sentiment: "negative", sort_order: 8 },
        ];
        for (const item of moods) {
            const { error } = await supabase.from("moods").insert({ user_id: userId, ...item } as never);
            if (!error) results.moods++;
        }

        // 4. Seed Aspects
        const aspects = [
            { name: "Story", category: "narrative" },
            { name: "Acting", category: "performance" },
            { name: "Direction", category: "technical" },
            { name: "Cinematography", category: "technical" },
            { name: "Music/Score", category: "audio" },
            { name: "VFX", category: "technical" },
            { name: "Dialogues", category: "narrative" },
            { name: "Pacing", category: "narrative" },
        ];
        for (const item of aspects) {
            const { error } = await supabase.from("aspects").insert({ user_id: userId, ...item } as never);
            if (!error) results.aspects++;
        }

        // 5. Seed Rewatch Options
        const rewatch = [
            { name: "Never again", value: 0, sort_order: 1 },
            { name: "Maybe someday", value: 1, sort_order: 2 },
            { name: "Would rewatch", value: 3, sort_order: 3 },
            { name: "Must rewatch", value: 4, sort_order: 4 },
            { name: "Instant classic", value: 5, sort_order: 5 },
        ];
        for (const item of rewatch) {
            const { error } = await supabase.from("rewatch_options").insert({ user_id: userId, ...item } as never);
            if (!error) results.rewatch++;
        }

        // 6. Seed Platforms
        const platforms = ["PVR INOX", "BookMyShow", "Paytm", "Amazon Pay"];
        for (const name of platforms) {
            const { error } = await supabase.from("platforms").insert({ user_id: userId, name } as never);
            if (!error) results.platforms++;
        }

        // 7. Seed Theaters (Example)
        const { error: tError } = await supabase.from("theaters").insert({
            user_id: userId,
            name: "INOX Phoenix Pallasio",
            city: "Lucknow",
            has_imax: true
        } as never);
        if (!tError) results.theaters++;

        return NextResponse.json({ success: true, seeded: results });

    } catch (error) {
        return NextResponse.json({ error: "Seed failed", details: String(error) }, { status: 500 });
    }
}
