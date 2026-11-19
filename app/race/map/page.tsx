import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/profile";
import { getWeekPulse } from "@/lib/pulse";
import { getMapRiders, getRace } from "@/lib/race";
import { voiceLines } from "../voice-lines";
import LiveMapPage from "./LiveMapPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live map · Race to Columbia" };

export default async function RaceMapRoute({ searchParams }: PageProps<"/race/map">) {
  const { demo } = await searchParams;
  const isDemo = demo === "1";
  const [{ user }, race, pulse] = isDemo
    ? [{ user: null }, null, null]
    : await Promise.all([getCurrentProfile(), getRace().catch(() => null), getWeekPulse().catch(() => null)]);
  const riders = race ? await getMapRiders(race, user?.id ?? null) : [];
  return <LiveMapPage riders={riders} demo={isDemo} voices={pulse ? voiceLines(pulse) : []} />;
}
