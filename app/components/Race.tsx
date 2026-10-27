import Link from "next/link";
import { Avatar, displayName } from "@/app/components/PostCard";
import { BADGES, STATIONS, STOPS_TO_COLUMBIA, badgesFor, type Badge, type Rider } from "@/lib/race";

/** Express-service diamond, used for badges. Filled when earned. */
export function BadgeDiamond({ badge, earned = true, size = 24 }: { badge: Badge; earned?: boolean; size?: number }) {
  return (
    <span
      title={`${badge.label}${earned ? "" : ` (not yet: ${badge.how.toLowerCase()})`}`}
      role="img"
      aria-label={badge.label}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 rotate-45 items-center justify-center rounded-[4px] ${
        earned ? "bg-metro" : "border-2 border-dashed border-ink/25 bg-transparent"
      }`}
    >
      <span
        style={{ fontSize: Math.round(size * 0.5) }}
        className={`-rotate-45 font-bold leading-none ${earned ? "text-ink" : "text-ink/35"}`}
      >
        {badge.glyph}
      </span>
    </span>
  );
}

export function BadgeRow({ rider, size = 18 }: { rider: Rider | undefined; size?: number }) {
  const earned = badgesFor(rider);
  if (earned.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {earned.map((b) => (
        <BadgeDiamond key={b.id} badge={b} size={size} />
      ))}
    </span>
  );
}

function RiderDot({ r, me, size = 26 }: { r: Rider; me: boolean; size?: number }) {
  return (
    <span
      title={`${displayName(r.first_name)}: ${r.points_week} stops`}
      className={`inline-block rounded-full ${me ? "ring-[3px] ring-metro" : "ring-2 ring-white"}`}
    >
      <Avatar name={displayName(r.first_name)} url={r.avatar_url} size={size} />
    </span>
  );
}

/** Thin red line with a dot where the rider is: used in lists. */
export function ProgressLine({ station }: { station: number }) {
  const pct = (station / STOPS_TO_COLUMBIA) * 100;
  return (
    <span className="relative block h-1.5 w-full rounded-full bg-bullet-red/20" aria-hidden="true">
      <span className="absolute inset-y-0 left-0 rounded-full bg-bullet-red" style={{ width: `${pct}%` }} />
      <span
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bullet-red bg-white"
        style={{ left: `${pct}%` }}
      />
    </span>
  );
}

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

export function riderStatus(r: Rider) {
  if (r.arrived_at || r.points_week >= STOPS_TO_COLUMBIA) return "Arrived at Columbia";
  const left = STOPS_TO_COLUMBIA - r.station;
  return `${STATIONS[r.station]}, ${left} ${left === 1 ? "stop" : "stops"} to go`;
}

/**
 * Home sidebar: one rule and one progress bar. Standings, the map and the full
 * scoring rules are one click away on /race (week 5 feedback: too many concepts
 * on the home page at once).
 */
export function RaceMini({ riders, meId }: { riders: Rider[]; meId: string | null }) {
  const active = riders.filter((r) => r.points_week > 0);
  const leader = active[0];
  const me = riders.find((r) => r.user_id === meId);
  const myRank = me ? active.findIndex((r) => r.user_id === meId) + 1 : 0;
  const stops = Math.min(me?.points_week ?? 0, STOPS_TO_COLUMBIA);

  return (
    <section aria-labelledby="race-mini" className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="race-mini" className="text-base font-bold">
          Race to Columbia
        </h2>
        <Link href="/race" className="text-sm font-medium text-bullet-blue hover:underline">
          View details
        </Link>
      </div>
      <p className="mt-0.5 text-sm text-muted">Every vote moves you one stop up the 1 train. First to Columbia wins the week.</p>

      {me ? (
        <div className="mt-3">
          <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{stops === 0 ? "You're at South Ferry" : riderStatus(me)}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {stops}/{STOPS_TO_COLUMBIA}
            </span>
          </div>
          <ProgressLine station={me.station} />
          {myRank > 0 && (
            <p className="mt-2 text-xs text-muted">{myRank === 1 ? "You're leading this week." : `${ordinal(myRank)} place this week.`}</p>
          )}
        </div>
      ) : leader ? (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <RiderDot r={leader} me={false} size={22} />
          <span>
            <span className="font-semibold">{displayName(leader.first_name)}</span> leads, at {STATIONS[leader.station]}.
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm">Nobody has left South Ferry yet.</p>
      )}
    </section>
  );
}

export function BadgeLegend({ rider }: { rider: Rider | undefined }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {BADGES.map((b) => {
        const earned = rider ? b.earned(rider) : false;
        return (
          <li key={b.id} className="flex items-center gap-3">
            <BadgeDiamond badge={b} earned={earned} size={28} />
            <span>
              <span className="block text-[15px] font-semibold">{b.label}</span>
              <span className="block text-sm text-muted">{earned ? "Earned" : b.how}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
