import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback. Google -> Supabase -> here with ?code=...
 * Exchanges the code for a session cookie, then sends the user on.
 * The redirect URI configured in Supabase must be exactly /auth/callback.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Vercel sits behind a load balancer, so prefer the forwarded host.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      const base = isLocal
        ? origin
        : forwardedHost
          ? `https://${forwardedHost}`
          : origin;

      // First-time users (no first/last name yet) go to onboarding.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile?.first_name || !profile?.last_name) {
          return NextResponse.redirect(
            `${base}/onboarding?next=${encodeURIComponent(next)}`
          );
        }
      }

      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
