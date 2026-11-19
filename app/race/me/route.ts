import { getMyStation } from "@/lib/race";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Where the signed-in rider is right now. Asked once after each new vote, for the arrival sign. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return Response.json({ station: null }, { headers: { "Cache-Control": "no-store" } });
    const me = await getMyStation(data.user.id);
    return Response.json({ station: me?.station ?? null, points: me?.points ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ station: null }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
