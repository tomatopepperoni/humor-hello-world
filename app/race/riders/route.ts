import { getMapRiders, getRace } from "@/lib/race";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** This week's riders (with each one's best caption), polled by the live map every 20 seconds. */
export async function GET() {
  try {
    const supabase = await createClient();
    // Only the id is needed here, so skip the profile row the pages load.
    const [{ data: auth }, race] = await Promise.all([supabase.auth.getUser(), getRace()]);
    const riders = await getMapRiders(race, auth.user?.id ?? null);
    return Response.json({ riders }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
