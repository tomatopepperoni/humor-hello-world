"use client";

import { useRouter } from "next/navigation";
import LiveMap, { demoRiders } from "../live/LiveMap";
import type { LiveRider } from "../live/scene";

/** /race/map: the live map on its own page (and ?demo=1 to try it with made-up riders). */
export default function LiveMapPage({ riders, demo }: { riders: LiveRider[]; demo: boolean }) {
  const router = useRouter();
  return (
    <LiveMap
      initialRiders={demo ? demoRiders(true) : riders}
      demo={demo}
      pollUrl={demo ? undefined : "/race/riders"}
      onClose={() => router.push("/race")}
    />
  );
}
