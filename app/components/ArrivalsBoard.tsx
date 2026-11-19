import Link from "next/link";
import { LineBullet } from "@/app/components/LineBullet";
import { displayName } from "@/app/components/PostCard";
import { STATIONS, STOPS_TO_COLUMBIA, type Rider } from "@/lib/race";

type Row = { tag: string; main: string; note: string; me?: boolean };

const stops = (n: number) => `${n} ${n === 1 ? "stop" : "stops"}`;
const votes = (n: number) => `${n} more ${n === 1 ? "vote" : "votes"}`;

/**
 * Home: the race as a platform arrivals board (week 11: the map looked good
 * but its purpose wasn't visible where people vote). It says where you are,
 * who is just ahead, and exactly how many votes it takes to pass them.
 * `riders` come ranked from getRace().
 */
export default function ArrivalsBoard({ riders, meId }: { riders: Rider[]; meId: string | null }) {
  const active = riders.filter((r) => r.points_week > 0);
  const me = meId ? riders.find((r) => r.user_id === meId) : undefined;
  const winner = riders.find((r) => r.arrived_at !== null);
  const where = (r: Rider) => STATIONS[Math.min(r.station, STOPS_TO_COLUMBIA)];
  const name = (r: Rider) => displayName(r.first_name);
  const rows: Row[] = [];

  if (me) {
    const left = Math.max(0, STOPS_TO_COLUMBIA - me.points_week);
    rows.push({
      tag: "You",
      main: me.points_week === 0 ? STATIONS[0] : where(me),
      note: me.points_week === 0 ? "Vote once to leave the station" : left === 0 ? "Arrived at Columbia" : `${stops(left)} to Columbia`,
      me: true,
    });
    const i = active.findIndex((r) => r.user_id === me.user_id);
    const ahead = i > 0 ? active[i - 1] : me.points_week === 0 ? active[active.length - 1] : undefined;
    const behind = i === 0 ? active[1] : undefined;
    if (ahead && ahead.points_week >= me.points_week && left > 0) {
      const need = ahead.points_week - me.points_week + 1;
      rows.push({ tag: "Ahead", main: `${name(ahead)} · ${where(ahead)}`, note: `${votes(need)} to pass` });
    } else if (behind) {
      rows.push({ tag: "Behind", main: `${name(behind)} · ${where(behind)}`, note: `${stops(me.points_week - behind.points_week)} back` });
    } else if (i === 0) {
      rows.push({ tag: "Behind", main: "Nobody yet", note: "You're the only train out" });
    }
  } else {
    const lead = active[0];
    rows.push(
      lead
        ? { tag: "Lead", main: `${name(lead)} · ${where(lead)}`, note: `${stops(Math.max(0, STOPS_TO_COLUMBIA - lead.points_week))} to Columbia` }
        : { tag: "Lead", main: "Nobody has left South Ferry", note: "The first vote takes the lead" }
    );
    rows.push({ tag: "You", main: "Not on board", note: "Sign in and vote to ride", me: true });
  }
  if (winner) {
    rows.push({ tag: "1st", main: winner.user_id === meId ? "You" : name(winner), note: "First to Columbia this week" });
  }

  return (
    <section aria-labelledby="arrivals" className="mt-4 overflow-hidden rounded-xl bg-sign text-white">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-5">
        <h2 id="arrivals" className="flex items-center gap-2 text-sm font-bold">
          <LineBullet letter="1" bg="#ee352e" size={22} />
          Race to Columbia
          <span className="hidden font-normal text-white/60 sm:inline">Every vote is one stop uptown. First to 116 St wins the week.</span>
        </h2>
        <Link href="/race" className="shrink-0 text-sm font-semibold text-metro hover:underline">
          Open the race →
        </Link>
      </div>
      <ul className="mt-2 divide-y divide-white/10 border-t border-white/10 font-mono text-[13px] sm:text-sm">
        {rows.map((r, i) => (
          <li
            key={r.tag}
            className="led-row grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2 text-[#ffb000] sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:px-5"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span className={`font-bold uppercase ${r.me ? "text-white" : ""}`}>{r.tag}</span>
            <span className="truncate font-bold">{r.main}</span>
            <span className="col-start-2 text-[#ffb000]/80 sm:col-start-3 sm:text-right">{r.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
