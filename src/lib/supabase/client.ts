import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co").trim();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  // Indian ISPs block supabase.co, so the browser goes through the /supabase
  // rewrite in next.config. The cookie name stays pinned to the project ref so
  // the server client still reads the same session.
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const url = typeof window === "undefined" ? supabaseUrl : `${window.location.origin}/supabase`;

  return createBrowserClient<Database>(url, supabaseKey, {
    cookieOptions: { name: `sb-${projectRef}-auth-token` },
  });
}
