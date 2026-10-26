import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/**
 * OAuth callback. Google -> Supabase -> here with ?code=...
 * Exchanges the code for a session cookie, then sends the user on.
 * The redirect URI configured in Supabase must be exactly /auth/callback.
 *
 * Week 7: new signups must come from an allowed domain (columbia.edu, ...) or
 * a whitelisted address, both managed in the admin area. The rule lives in the
 * database function public.signup_allowed(): existing members and superadmins
 * always pass, and with nothing configured everyone passes.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

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
        const { data: allowed, error: gateError } = await supabase.rpc("signup_allowed");
        // gateError: week-7 SQL not run yet, so there is no gate to enforce.
        if (!gateError && allowed === false) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${base}/login?error=domain`);
        }

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
