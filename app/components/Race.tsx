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

function groupByStation(riders: Rider[]) {
  const m = new Map<number, Rider[]>();
  for (const r of riders) if (r.points_week > 0) m.set(r.station, [...(m.get(r.station) ?? []), r]);
  return m;
}

/** Horizontal position of station i on the strip map (room on the right for the last rotated label). */
const xAt = (i: number) => `calc(28px + ${i} * ((100% - 168px) / ${STATIONS.length - 1}))`;

/**
 * The strip map you see above subway doors, with riders standing at their stop.
 * Wide screens: horizontal strip (scrolls sideways inside its box if needed).
 * Phones: vertical, Columbia at the top.
 */
export function RaceMap({ riders, meId }: { riders: Rider[]; meId: string | null }) {
  const at = groupByStation(riders);
  const last = STATIONS.length - 1;

  return (
    <div>
      {/* horizontal strip map */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <div className="relative min-w-[980px]" style={{ height: 300 }}>
          <div className="absolute h-1.5 rounded-full bg-bullet-red" style={{ left: 28, right: 140, top: 168 }} />
          {STATIONS.map((name, i) => {
            const x = xAt(i);
            const here = at.get(i) ?? [];
            const end = i === 0 || i === last;
            return (
              <div key={name}>
                <div className="absolute" style={{ left: `calc(${x} - 2px)`, top: 156 }}>
                  <span
                    className={`absolute bottom-0 left-0 origin-bottom-left -rotate-[52deg] whitespace-nowrap text-[12px] ${
                      i === last ? "font-bold text-ink" : end ? "font-semibold text-ink" : "text-ink/75"
                    }`}
                  >
                    {name}
                  </span>
                </div>
                <span
                  className={`absolute -translate-x-1/2 rounded-full ${
                    i === last ? "h-5 w-5 border-4 border-sign bg-metro" : "h-3.5 w-3.5 border-[3px] border-bullet-red bg-white"
                  }`}
                  style={{ left: x, top: i === last ? 161 : 164 }}
                />
                {here.length > 0 && (
                  <div className="absolute flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: x, top: 190 }}>
                    {here.slice(0, 3).map((r) => (
                      <RiderDot key={r.user_id} r={r} me={r.user_id === meId} />
                    ))}
                    {here.length > 3 && <span className="text-[11px] font-semibold text-muted">+{here.length - 3}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* vertical line diagram for phones */}
      <ol className="rounded-xl border bg-card px-3 py-2 md:hidden">
        {[...STATIONS].reverse().map((name, k) => {
          const i = last - k;
          const here = at.get(i) ?? [];
          return (
            <li key={name} className={`relative flex items-center gap-3 pl-9 ${here.length ? "min-h-11" : "min-h-8"}`}>
              <span
                aria-hidden="true"
                className={`absolute left-[15px] w-1.5 bg-bullet-red ${i === last ? "bottom-0 top-1/2" : i === 0 ? "bottom-1/2 top-0" : "inset-y-0"}`}
              />
              <span
                aria-hidden="true"
                className={`absolute top-1/2 -translate-y-1/2 rounded-full ${
                  i === last ? "left-[8px] h-5 w-5 border-4 border-sign bg-metro" : "left-[11px] h-3.5 w-3.5 border-[3px] border-bullet-red bg-white"
                }`}
              />
              <span className={`text-sm ${i === last ? "font-bold" : here.length ? "font-semibold" : "text-ink/70"}`}>{name}</span>
              {here.length > 0 && (
                <span className="ml-auto flex -space-x-1.5">
                  {here.slice(0, 4).map((r) => (
                    <RiderDot key={r.user_id} r={r} me={r.user_id === meId} size={24} />
                  ))}
                  {here.length > 4 && <span className="pl-2 text-xs font-semibold text-muted">+{here.length - 4}</span>}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
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

/** Compact standings for the home sidebar. */
export function RaceMini({ riders, meId }: { riders: Rider[]; meId: string | null }) {
  const active = riders.filter((r) => r.points_week > 0);
  const top = active.slice(0, 5);
  const me = riders.find((r) => r.user_id === meId);
  const myRank = me ? active.findIndex((r) => r.user_id === meId) + 1 : 0;

  return (
    <section aria-labelledby="race-mini" className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="race-mini" className="text-base font-bold">
          Race to Columbia
        </h2>
        <Link href="/race" className="text-sm font-medium text-bullet-blue hover:underline">
          Open map
        </Link>
      </div>
      <p className="mt-0.5 text-sm text-muted">This week on the 1 train. Votes and posts move you uptown.</p>
      {top.length === 0 ? (
        <p className="mt-3 text-sm">Nobody has left South Ferry yet. Vote on a caption to board.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {top.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-2.5">
              <span className="w-4 text-right text-sm font-bold tabular-nums">{i + 1}</span>
              <RiderDot r={r} me={r.user_id === meId} size={24} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{displayName(r.first_name)}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {Math.min(r.points_week, STOPS_TO_COLUMBIA)}/{STOPS_TO_COLUMBIA}
                  </span>
                </span>
                <span className="mt-1.5 block">
                  <ProgressLine station={r.station} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {me && myRank > 5 && (
        <p className="mt-3 border-t pt-3 text-sm">
          You&apos;re {ordinal(myRank)}, at {STATIONS[me.station]}.
        </p>
      )}
      {me && me.points_week === 0 && (
        <p className="mt-3 border-t pt-3 text-sm">You haven&apos;t boarded this week. Each vote is one stop.</p>
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
