import { VIBES, type Vibe } from "@/lib/vibes";

/** A subway-style line bullet: one bold character in a coloured circle. */
export function LineBullet({
  letter,
  bg,
  fg = "#ffffff",
  size = 24,
  title,
}: {
  letter: string | number;
  bg: string;
  fg?: string;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.56) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none tracking-tight"
    >
      {letter}
    </span>
  );
}

/** Bullet + optional label for one of the four caption vibes. */
export function VibeBullet({
  vibe,
  size = 22,
  withLabel = false,
}: {
  vibe: Vibe;
  size?: number;
  withLabel?: boolean;
}) {
  const v = VIBES[vibe];
  const bullet = <LineBullet letter={v.bullet.letter} bg={v.bullet.bg} fg={v.bullet.fg} size={size} title={withLabel ? undefined : v.label} />;
  if (!withLabel) return bullet;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
      {bullet}
      {v.label}
    </span>
  );
}
