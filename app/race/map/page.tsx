import type { Metadata } from "next";
import { displayName } from "@/app/components/PostCard";
import { getCurrentProfile } from "@/lib/profile";
import { getRace } from "@/lib/race";
import LiveMapPage from "./LiveMapPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live map · Race to Columbia" };

export default async function RaceMapRoute({ searchParams }: PageProps<"/race/map">) {
  const { demo } = await searchParams;
  const isDemo = demo === "1";
  const [{ user }, race] = isDemo ? [{ user: null }, null] : await Promise.all([getCurrentProfile(), getRace().catch(() => null)]);
  const riders = (race?.riders ?? []).map((r) => ({
    id: r.user_id,
    name: displayName(r.first_name),
    avatarUrl: r.avatar_url,
    station: r.station,
    points: r.points_week,
    me: r.user_id === user?.id,
  }));
  return <LiveMapPage riders={riders} demo={isDemo} />;
}
