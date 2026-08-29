import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { canUseLocalSupabaseFallback, hasSupabaseConfig } from "@/lib/supabase/config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
    if (canUseLocalSupabaseFallback()) {
        return NextResponse.next({ request });
    }

    if (!hasSupabaseConfig()) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: CookieToSet[]) {
                    cookiesToSet.forEach(({ name, value }: CookieToSet) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // getClaims, not getUser: getUser sends the access token to the Auth
    // server on EVERY request, and this middleware runs on every navigation,
    // so each page view paid a round trip to Supabase before it could start
    // rendering. This project signs its JWTs with an asymmetric key (ES256),
    // so getClaims verifies the signature locally with WebCrypto against the
    // JWKS, which auth-js caches module-level and therefore fetches once per
    // warm instance rather than once per request.
    //
    // Session refresh is unaffected: with no explicit token, getClaims calls
    // getSession internally, which still refreshes an expired session and
    // writes the rotated cookies through the setAll handler above. On a
    // symmetric key or without WebCrypto it falls back to getUser by itself.
    const {
        data: claims,
    } = await supabase.auth.getClaims();
    const user = claims?.claims ?? null;

    // Public routes that don't require auth
    const publicRoutes = ["/login", "/auth/callback", "/api"];
    const isPublicRoute = publicRoutes.some((route) =>
        request.nextUrl.pathname.startsWith(route)
    );

    // Redirect to login if not authenticated and trying to access protected route
    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    // Redirect to home if authenticated and trying to access login
    if (user && request.nextUrl.pathname === "/login") {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        // sw.js, manifest.webmanifest and offline.html are excluded because
        // this middleware answers an unauthenticated request with a redirect
        // to /login. A browser asking for the manifest would get an HTML login
        // page and refuse to install the app; a service worker fetched as HTML
        // never registers at all.
        "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
