-- Week 4: Rating app
-- Run this in the Supabase SQL editor (project: humor-joke). Safe to re-run.
--
-- What it does:
--   1. posts     – a photo and/or a one-line "moment" a user wants captioned
--   2. captions  – AI-generated captions for a post (one row per caption, with the
--                  exact prompt + model that produced it)
--   3. votes     – one row per (user, caption): +1 or -1
--   4. views     – caption_scores / public_profiles so the feed can show scores and
--                  author names without opening the underlying tables
--   5. storage   – "photos" bucket for uploaded images
--   6. RLS       – turned ON for every table in public, strictest rules that still
--                  let the app work

-- 1. posts ---------------------------------------------------------------------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  image_url   text,                                   -- public URL in the "photos" bucket (nullable: text-only posts)
  image_path  text,                                   -- storage path, so the owner can delete the file
  context     text,                                   -- what the user typed ("first time at Levain, 40 min line")
  vibe        text not null default 'chronically-online',
  theme       text,                                   -- the daily theme this post answered, if any
  created_at  timestamptz not null default now(),
  constraint posts_has_content check (image_url is not null or context is not null)
);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_user_id_idx on public.posts (user_id);

-- 2. captions ------------------------------------------------------------------
create table if not exists public.captions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  text        text not null,
  prompt      text not null,                          -- full prompt sent to the model (assignment requirement)
  model       text not null,                          -- e.g. gemini-2.5-flash
  position    smallint not null default 0,            -- order within the post (0,1,2)
  created_at  timestamptz not null default now()
);
create index if not exists captions_post_id_idx on public.captions (post_id);

-- 3. votes ---------------------------------------------------------------------
create table if not exists public.votes (
  id          uuid primary key default gen_random_uuid(),
  caption_id  uuid not null references public.captions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  value       smallint not null check (value in (-1, 1)),
  created_at  timestamptz not null default now(),
  unique (caption_id, user_id)                         -- one vote per user per caption
);
create index if not exists votes_caption_id_idx on public.votes (caption_id);
create index if not exists votes_user_id_idx on public.votes (user_id);

-- 4. views ---------------------------------------------------------------------
-- Aggregated scores. security_invoker is OFF on purpose: the view runs with the
-- owner's privileges, so readers get counts without being able to read the votes
-- table itself (which is restricted to "your own votes" below).
create or replace view public.caption_scores
with (security_invoker = false) as
  select
    caption_id,
    count(*) filter (where value = 1)::int  as upvotes,
    count(*) filter (where value = -1)::int as downvotes,
    coalesce(sum(value), 0)::int            as score
  from public.votes
  group by caption_id;

-- Only the columns the feed needs from profiles (no email, no bio).
create or replace view public.public_profiles
with (security_invoker = false) as
  select id, first_name, avatar_url
  from public.profiles;

grant select on public.caption_scores to anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- 5. storage bucket for post photos -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos are publicly readable" on storage.objects;
create policy "photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "users can upload their own photos" on storage.objects;
create policy "users can upload their own photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can delete their own photos" on storage.objects;
create policy "users can delete their own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 6. Row Level Security --------------------------------------------------------
alter table public.jokes    enable row level security;
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.captions enable row level security;
alter table public.votes    enable row level security;

-- jokes: the /jokes page is login-only, so only authenticated users can read.
drop policy if exists "jokes readable by members" on public.jokes;
create policy "jokes readable by members"
  on public.jokes for select to authenticated
  using (true);

-- profiles: you can only see/edit your own row. Other users' names reach the
-- feed through the public_profiles view (first_name + avatar only).
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- posts: everyone (even logged out) can browse the feed; only members create,
-- and only the owner can delete.
drop policy if exists "posts: public read" on public.posts;
create policy "posts: public read"
  on public.posts for select
  using (true);

drop policy if exists "posts: insert own" on public.posts;
create policy "posts: insert own"
  on public.posts for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "posts: delete own" on public.posts;
create policy "posts: delete own"
  on public.posts for delete to authenticated
  using (user_id = auth.uid());

-- captions: same shape as posts. No update policy – generated text is immutable.
drop policy if exists "captions: public read" on public.captions;
create policy "captions: public read"
  on public.captions for select
  using (true);

drop policy if exists "captions: insert own" on public.captions;
create policy "captions: insert own"
  on public.captions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

drop policy if exists "captions: delete own" on public.captions;
create policy "captions: delete own"
  on public.captions for delete to authenticated
  using (user_id = auth.uid());

-- votes: you can only see and change YOUR votes. Totals come from caption_scores.
drop policy if exists "votes: read own" on public.votes;
create policy "votes: read own"
  on public.votes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "votes: insert own" on public.votes;
create policy "votes: insert own"
  on public.votes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "votes: update own" on public.votes;
create policy "votes: update own"
  on public.votes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "votes: delete own" on public.votes;
create policy "votes: delete own"
  on public.votes for delete to authenticated
  using (user_id = auth.uid());
