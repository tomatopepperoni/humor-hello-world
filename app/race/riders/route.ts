import { getCurrentProfile } from "@/lib/profile";
import { getRace } from "@/lib/race";
import { displayName } from "@/app/components/PostCard";

export const dynamic = "force-dynamic";

/** This week's riders, polled by the live map every 20 seconds. */
export async function GET() {
  try {
    const [{ user }, race] = await Promise.all([getCurrentProfile(), getRace()]);
    const riders = race.riders.map((r) => ({
      id: r.user_id,
      name: displayName(r.first_name),
      avatarUrl: r.avatar_url,
      station: r.station,
      points: r.points_week,
      me: r.user_id === user?.id,
    }));
    return Response.json({ riders }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
