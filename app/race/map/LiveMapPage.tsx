"use client";

import { useRouter } from "next/navigation";
import LiveMap, { demoRiders } from "../live/LiveMap";
import MapErrorBoundary from "../live/MapErrorBoundary";
import type { LiveRider } from "../live/scene";
import type { VoiceLine } from "../voice-lines";

/** /race/map: the live map on its own page (and ?demo=1 to try it with made-up riders). */
export default function LiveMapPage({ riders, demo, voices = [] }: { riders: LiveRider[]; demo: boolean; voices?: VoiceLine[] }) {
  const router = useRouter();
  const list = demo ? demoRiders(true) : riders;
  const close = () => router.push("/race");
  return (
    <MapErrorBoundary riders={list} onClose={close}>
      <LiveMap initialRiders={list} demo={demo} pollUrl={demo ? undefined : "/race/riders"} onClose={close} voices={voices} />
    </MapErrorBoundary>
  );
}
