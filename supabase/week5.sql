-- Week 5
-- Run this in the Supabase SQL editor (project: humor-joke). Safe to re-run.
--
-- Part 1: captions.vibe + hide prompts from the API
--   Every caption keeps its full prompt in the database, but the browser and
--   the Data API can no longer read that column. The voice a caption was
--   written in moves to its own `vibe` column (backfilled from the prompt).
--
-- Part 2: Race to Columbia
--
-- One read-only view, rider_stats, with per-person totals for the weekly race
-- along the 1 train (South Ferry -> 116 St-Columbia University, 23 stops):
--   +1 stop for every caption you vote on
--   +2 stops for every post
--   +1 stop for every upvote someone else gives one of your captions
-- The week starts Monday 00:00 New York time.
--
-- votes is RLS-protected (you can only read your own rows), so like
-- caption_scores this view runs with the owner's rights (security_invoker = false)
-- and exposes only counts, never who voted on what.


-- Part 1 ----------------------------------------------------------------------
alter table public.captions add column if not exists vibe text;

update public.captions c
set vibe = v.key
from (values
  ('Conductor', 'conductor'),
  ('Service alert', 'service-alert'),
  ('Showtime', 'showtime'),
  ('Overheard', 'overheard'),
  ('Roast me', 'roast'),
  ('Chronically online', 'chronically-online'),
  ('Midwest nice', 'midwest-nice'),
  ('Main character', 'main-character')
) as v(label, key)
where c.vibe is null
  and position(E'\nVibe: ' || v.label || '. ' in E'\n' || c.prompt) > 0;

-- Column-level privileges: clients may read every column except prompt.
-- (Inserting a prompt is still allowed; RLS still limits rows as before.)
revoke select on public.captions from anon, authenticated;
grant select (id, post_id, user_id, text, model, position, created_at, vibe)
  on public.captions to anon, authenticated;

-- Part 2 ----------------------------------------------------------------------
create or replace view public.rider_stats
with (security_invoker = false) as
with wk as (
  select (date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York') as start
),
events as (
  -- votes you cast this week
  select v.user_id, v.created_at as at, 1 as pts
  from public.votes v, wk
  where v.created_at >= wk.start
  union all
  -- posts you made this week
  select p.user_id, p.created_at, 2
  from public.posts p, wk
  where p.created_at >= wk.start
  union all
  -- upvotes other people gave your captions this week
  select c.user_id, v.created_at, 1
  from public.votes v
  join public.captions c on c.id = v.caption_id, wk
  where v.value = 1 and v.user_id <> c.user_id and v.created_at >= wk.start
),
running as (
  select user_id, at, pts,
         sum(pts) over (partition by user_id order by at rows between unbounded preceding and current row) as total
  from events
),
week_totals as (
  select user_id,
         sum(pts)::int as points_week,
         min(at) filter (where total >= 23) as arrived_at
  from running
  group by user_id
),
votes_cast as (
  select v.user_id,
         count(*) filter (where v.created_at >= (select start from wk))::int as votes_week,
         count(*)::int as votes_all
  from public.votes v
  group by v.user_id
),
posts_made as (
  select p.user_id,
         count(*) filter (where p.created_at >= (select start from wk))::int as posts_week,
         count(*)::int as posts_all
  from public.posts p
  group by p.user_id
),
upvotes_got as (
  select c.user_id,
         count(*) filter (where v.created_at >= (select start from wk))::int as upvotes_received_week,
         count(*)::int as upvotes_received_all
  from public.votes v
  join public.captions c on c.id = v.caption_id
  where v.value = 1 and v.user_id <> c.user_id
  group by c.user_id
),
best as (
  select c.user_id, max(s.score)::int as best_caption_score
  from public.captions c
  join public.caption_scores s on s.caption_id = c.id
  group by c.user_id
)
select
  pr.id as user_id,
  pr.first_name,
  pr.avatar_url,
  coalesce(w.points_week, 0) as points_week,
  w.arrived_at,
  coalesce(vc.votes_week, 0) as votes_week,
  coalesce(vc.votes_all, 0) as votes_all,
  coalesce(pm.posts_week, 0) as posts_week,
  coalesce(pm.posts_all, 0) as posts_all,
  coalesce(ug.upvotes_received_week, 0) as upvotes_received_week,
  coalesce(ug.upvotes_received_all, 0) as upvotes_received_all,
  coalesce(b.best_caption_score, 0) as best_caption_score
from public.profiles pr
left join week_totals w on w.user_id = pr.id
left join votes_cast vc on vc.user_id = pr.id
left join posts_made pm on pm.user_id = pr.id
left join upvotes_got ug on ug.user_id = pr.id
left join best b on b.user_id = pr.id;

grant select on public.rider_stats to anon, authenticated;
