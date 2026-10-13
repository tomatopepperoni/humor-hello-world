# humor-hello-world → Captioned NYC

Weekly assignment app for COMS 6998 *Design for Generative AI* (Fall 2026).
Next.js (App Router) + Supabase + Google Gemini, deployed on Vercel.

**Captioned NYC** (week 4): post a photo or a one-line "moment" from your week in
the city, pick a vibe, and Gemini writes three captions. Everyone on campus votes
them up or down; the best themed post of the day tops the board.

| Week | What was added |
|------|----------------|
| 1 | Hello World page, Vercel deploy |
| 2 | Supabase `jokes` table, `/jokes` list page |
| 3 | Google login (Supabase Auth), `profiles` table + trigger, onboarding, `/profile` with photo upload, protected `/jokes` route |
| 4 | AI caption generation (Gemini) saved to `posts` / `captions` with the exact prompt, up/down **votes** table, daily theme + leaderboard, **RLS on every table** |
| 5 | Feedback iteration: complete captions (parser fix), one meme card per caption in a responsive grid, five subway-voice caption styles, up/down counts read back from the DB, Race to Columbia map + badges, daily Gemini limit, prompts hidden from the API, subway-sign redesign |

## Design concept: the city's own wayfinding

Sam, our persona, is new to New York. The first system every newcomer has to learn
here is the subway, and its signage is the most widely shared visual language in the
city. The app is about New York moments, so instead of a generic social-app look it
borrows that language. Subway signs are also built to be read at a glance, which is
what a feed you scroll through between classes needs.

| Subway element | Where it shows up | Why |
|---|---|---|
| Black station-sign band with the thin white rule along the top | Header, today's theme, the "enter today's theme" switch, notices | Black means "the system is talking" (theme, status, navigation); white cards are what people posted. |
| Line bullets (letter in the line's official colour) | The five caption voices: **1** Conductor (red), **G** Service alert (lime), **A** Showtime (blue), **L** Overheard (grey), **R** Roast me (yellow) | A voice is a line: same destination (your moment), different ride. Each meme carries its voice's bullet. The 1 is Columbia's own line. Week-4 vibes stay on old posts but are no longer offered. |
| Strip map above the subway doors | **Race to Columbia** (`/race`): the 1 line from South Ferry to 116 St with everyone's avatar at their stop; vertical line diagram on phones | Turns voting into travel: every vote is a stop, the destination is campus. |
| Express-service diamonds | Badges | The MTA marks express service with a diamond; badges mark the riders who went further. |
| Ads in a subway car (a photo with one line of copy) | Meme cards: one photo + one caption, in a grid | Each caption competes on its own, and several fit on one screen. A post without a photo is set as a station sign so it still has an image. |
| MetroCard yellow | The one primary action on each screen (Post, Write 3 captions, Sign in, Try again), rank bullets, leading caption | One yellow thing per screen tells you what to do next. |
| Route map | "How it works": three stations connected by a line | It is a real sequence (post → Gemini writes → everyone votes), so it is drawn as stops on one line. |
| Platform countdown clock (amber digits) | "Next theme in 11 h 12 min" plus tomorrow's theme | A reason to come back, framed like checking when the next train arrives. |
| Service alerts ("Delays", yellow diamond) | When Gemini is overloaded: "Delays on the Gemini line" | Tells you the problem is temporary and not your fault, keeps your photo and text, and the button turns into "Try again". Real errors use a red notice instead. |
| Train on the line | Progress view while Gemini writes | Waiting 5–15 s feels shorter when you can see something moving and read what step it's on. |
| Station number | Today's date in a yellow bullet next to the theme | The theme is "today's stop". |
| "No train to this stop" | 404 page | Same voice for dead ends. |
| Bullet icon | Favicon and home-screen icon: the yellow **C** | The app is recognisable as a tab or icon on a phone. |

**Type.** One family, Geist Sans: a Swiss grotesk in the same lineage as the
Helvetica on MTA signs. Headlines are bold and tightly set like sign text. Everything
is sentence case (subway signs use mixed case because it reads faster). The caption is
the largest text on every card because the AI output is the product.

**Colour tokens** (`app/globals.css`): sign `#000000`, paper `#ECEEEC` (platform
concrete, cooler than white), card `#FFFFFF`, MetroCard `#FCCC0A`, upvote `#00933C`
(4/5/6 green), downvote `#6D6E71` (L-train grey). Downvotes are grey, not red, so a
downvote reads as "not funny", not as a punishment.

**Layout.** One column, at most 672 px wide, designed for phones first. On a phone each
caption comes first and the vote/copy row sits under it, within thumb reach; on wider
screens the vote control moves to the left of the caption.

**Accessibility.** Colour is never the only signal (bullets carry letters, votes have
labels and `aria-pressed`), there is a visible blue focus ring, a skip link, reduced
motion is respected, and black-on-yellow keeps text contrast high.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the two Supabase values + GEMINI_API_KEY
npm run dev
```

## Week 5 – Get feedback and iterate

**Setup:** run [`supabase/week5.sql`](supabase/week5.sql) once in the Supabase SQL
editor (adds `captions.vibe`, hides `captions.prompt` from clients, creates the
`rider_stats` view for the race). The app also runs before it's applied: it falls
back to reading the voice from the prompt and estimates the race from public data.
Optional env: `DAILY_CAPTION_RUNS` (default 10).

### What testing the live week-4 build showed

- **Both posts in production had broken captions.** One caption was literally `[`,
  others stopped mid-sentence ("…free, bruised bananas in"). Cause: newer Gemini
  models spend "thinking" tokens out of `maxOutputTokens`, so 1024 tokens cut the JSON
  array off, and the fallback parser split the half-finished JSON by line.
- Borders rendered pure black (Tailwind v4 defaults `border` to `currentColor`).
- The feed didn't explain itself to a first-time visitor, and a "Jokes" link from
  week 2 sat in the header of a captions app.
- Once you had captions there was nothing to *do* with them: no way to copy one, share
  the post, or ask for different captions. Delete had no confirmation.
- `?next=` was passed straight into redirects (open-redirect).

### What changed

**Captions you can trust**
- `maxOutputTokens` 1024 → 8192; thought parts are ignored.
- The parser salvages only *complete* string literals from cut-off JSON and requires
  3 usable, distinct captions; anything less counts as a miss.
- "High demand" 503s are per model, so a request now goes *across* the model list
  first (3.6-flash, 3.5-flash, 3.5-flash-lite, 3.8-flash, then the `gemini-flash-latest`
  / `gemini-flash-lite-latest` aliases), then waits and makes up to two more passes,
  all inside ~52 s (`maxDuration = 60` on the pages that call Gemini). Before, one busy
  model could use up the whole time budget. When every model is busy the form says so
  in plain words, keeps your photo and text, and the button becomes "Try again".
- Captions already in the database are cleaned on read (`lib/caption-text.ts`):
  JSON debris is stripped and fragments like `[` are hidden.

**Usability**
- Home: today's theme as a station sign with the date, tomorrow's theme as a teaser,
  a three-stop "How it works" route map for logged-out visitors, and a
  "N posts from today are waiting for your vote" prompt for logged-in ones.
- Each caption has **Copy**; each post has **Share** (phone share sheet, or copies the
  link). Post pages set Open Graph tags so a shared link previews the leading caption
  and the photo.
- The leading caption is highlighted. Feed cards show the top 3; the post page shows all.
- Owners get **Write 3 more captions** in any voice (the prompt lists the existing
  captions so they aren't repeated; max 9 per post) and a two-step delete.
- Create: drag-and-drop or tap upload, photos resized to ≤1600 px JPEG in the browser
  (phone photos upload faster and fit the bucket), vibe cards that say what each vibe
  does, a progress view while Gemini works, and errors that say what to do next.
- Profile: your posts with points, totals (posts, points earned, votes cast), sign-out.
- Sign-in page says why you're there ("Sign in to vote on this post") and returns you
  to it afterwards; `/login?next=` only accepts same-site paths.
- Loading skeleton, error screen with retry, and a 404 page.
- Gemini overload shows as a "Delays on the Gemini line" service alert instead of a raw
  error; the home page shows a countdown to the next theme.
- Vote buttons have clear labels, `aria-pressed`, and stay in sync when the same caption
  is on screen twice.

**Visual design**
- One visual language taken from NYC subway signage: black sign bands with a thin white
  rule, the caption voices as line bullets, MetroCard yellow for the one primary
  action on each screen, green/grey for up/down votes. Geist for all type.
- Captions are the largest text on a card. Phone layout puts the caption first and the
  vote/copy row under it.

### PM comments on week 4 → what changed

| PM comment | Change |
|---|---|
| AI captions are saved broken (a "[" as a caption, sentences cut off) | `maxOutputTokens` 1024 → 8192 (thinking tokens were eating the budget), a parser that only accepts complete strings and requires 3, retries across models, and cleanup of the broken rows already in the DB. |
| Not clear what the site is on first open | The home page now opens with "Your week in New York, captioned by the subway." and one paragraph on what you do here, next to today's theme. Logged-out visitors also get a three-stop "How it works". |
| Show several memes on one screen | The feed and leaderboard are grids (2 columns on tablets/laptops, 3–4 on wide screens). |
| Make images a core part of each post | Every card leads with the photo. The create form puts the photo first and explains it. A post without a photo gets a station-sign image of its text, so no card is a bare one-liner. |
| Use responsive design, not a fixed box in the center | Layout widens to 1280 px with a sidebar on desktop, a single column on phones, and a bottom tab bar on phones. |
| Hide the prompt from users, keep saving it | The prompt is no longer shown anywhere. It's still saved on every caption, and `supabase/week5.sql` revokes client read access to that column (the voice moved to its own `vibe` column). |
| One photo gets different votes per caption; split the post per caption | Each caption is now its own meme card (photo + that caption) with its own votes, and Top today / all-time rank memes, not posts. The post page still shows all captions for that photo. |
| Double-check RLS on every table | Checked against production with the public anon key: reading `votes`, `profiles`, `jokes` returns nothing; inserting a vote or post is rejected (42501); updating captions/profiles and deleting posts touches 0 rows. Only `posts`, `captions` (minus `prompt` after week5.sql) and the count views are public. |

### Feedback group session (week 5) → what changed

| Feedback | Change |
|---|---|
| Make it responsive; the nav bar is stuck to the top | Header hides while you scroll down and comes back when you scroll up. On phones the navigation moves to a bottom tab bar. Desktop gets a wide layout with a sidebar. |
| Humor without an image is fine but can be boring; make the caption concept more specific | Captions now speak in five NYC-subway voices, each a real line bullet: **1** Conductor, **G** Service alert, **A** Showtime, **L** Overheard, **R** Roast me. The picker shows a sample of each. Text-only posts become a station-sign image. |
| Up/down votes must update the DB consistently (from −2, one upvote showed 0) | Switching your own ▼ to ▲ changes the net by 2, which looked like a bug. Buttons now show the ▲ and ▼ counts separately, and after each click the server reads the counts back from `caption_scores` and the buttons show exactly that. |
| Another group made a 3D map / "who gets to Columbia fastest" / build a line with the subway | **Race to Columbia**: a weekly race up the 1 train from South Ferry to 116 St. +1 stop per vote you cast, +2 per post, +1 per upvote your captions get. Strip-map of the 1 line with everyone's avatar at their stop (`/race`), standings, a sidebar summary on the home page. |
| Badges to raise ratings | Five badges (First ride, Straphanger, Rush hour, Crowd pleaser, Made it to Columbia), three of them for voting or being voted on, shown in standings and on your profile. |
| On a paid API, set limits | Each account gets 10 caption runs a day (`DAILY_CAPTION_RUNS`), shown on the create page; the server enforces it before calling Gemini. |
| Gemini returned 503 "high demand" during the demo | Requests now rotate across six models (including the `gemini-flash-latest` aliases) before retrying, inside a 52 s budget, and an overload shows as a "Delays on the Gemini line" notice with Try again. |

## Week 4 – Rating app

### Product thinking

The user persona is **Sam**: Columbia College junior, chronically online, from the
Midwest, new to NYC, explores the city on weekends. Every feature maps to that:

| Sam's situation | Feature |
|-----------------|---------|
| Takes a lot of photos on weekends but overthinks captions | Upload a photo (or just type the moment) → 3 Gemini captions in different angles |
| Chronically online: wants captions that sound like the internet, not like a brand | Vibe picker: *Chronically online*, *Roast me*, *Midwest nice*, *Main character* – each is a different system instruction |
| Needs a reason to open the site tomorrow, not just once | **Daily theme** (rotates at midnight NY time, e.g. "Your most unhinged subway moment") + **Top today** board that resets daily |
| Wants to feel part of a campus thing | Public feed (no login needed to browse), votes and an all-time "best captions" board; logging in is only required to post/vote |
| New to the city, slightly self-conscious | Roast mode is instructed to roast the *situation / NYC-newbie energy*, never appearance or identity |

How this makes Crackd.ai better: Crackd gives you captions for *your* photo and stops.
Adding (1) a shared daily prompt and (2) voting turns a one-shot tool into a feed
people check daily – the content other users generate becomes the reason to return,
and the vote data tells you which prompt/vibe combinations actually land.

### What was built

- **Generate** (`/create`, login required): photo upload to a `photos` storage bucket
  (browser → Storage, own folder only) and/or a 200-char description, vibe, opt-in to
  today's theme. Server action `generateCaptions` downloads the image, calls Gemini
  (`gemini-3.6-flash`, multimodal; falls back to 3.5-flash / 3.5-flash-lite when a model returns 503), parses a JSON array of 3 captions and inserts one
  `posts` row + three `captions` rows. **The full prompt and model name are saved on
  every caption row** (week 5: no longer shown to users, see above).
- **Vote** (`VoteButtons` → server action `vote`): inserts a row in `votes`
  (`caption_id`, `user_id`, `value ∈ {-1, 1}`, unique per user+caption). Clicking the
  same arrow again deletes the row, the other arrow updates it. Optimistic UI, then
  `router.refresh()`. Logged-out users are sent to `/login?next=…`.
- **Feed** (`/`): today's theme hero, "Top today" (themed posts ranked by total
  caption score), "Fresh" (latest 20). **Leaderboard** (`/top`): top posts today +
  best captions of all time. **Post page** (`/p/[id]`): captions, votes, and
  delete for the owner.
- **Data** lives in `posts`, `captions`, `votes`; read helpers in `lib/posts.ts`
  join scores from the `caption_scores` view and author names from `public_profiles`.

### RLS (row level security)

Run [`supabase/week4_rating.sql`](supabase/week4_rating.sql). It enables RLS on
**every** table in `public` and adds the tightest policies the app can run with:

| Table | select | insert | update | delete |
|-------|--------|--------|--------|--------|
| `jokes` | authenticated only (the page is login-only) | – | – | – |
| `profiles` | own row | own row | own row | – |
| `posts` | everyone (public feed) | own (`user_id = auth.uid()`) | – | own |
| `captions` | everyone | own, and only onto your own post | – (immutable) | own |
| `votes` | **own votes only** | own | own | own |

Week 5 (`supabase/week5.sql`): clients can read every `captions` column except
`prompt` (column privileges on top of RLS), and the `rider_stats` view exposes only
per-person counts for the race.

Totals are exposed through the `caption_scores` view and names/avatars through the
`public_profiles` view (both `security_invoker = false`), so nobody can read other
users' individual votes, emails or bios. Storage: `photos` bucket is public-read,
upload/delete only inside `<user id>/`.

### Setup (one-time)

1. Supabase → SQL editor → run `supabase/week4_rating.sql`.
2. Get a free Gemini key at https://aistudio.google.com/apikey.
3. Add `GEMINI_API_KEY` to `.env.local` and to Vercel → Settings → Environment Variables, then redeploy.

### Feedback

The PM's comments on this version and what was done about them are in the
week 5 section above.

## Week 3 – Auth setup checklist

Everything below is one-time configuration in Supabase / Google Cloud / Vercel.
The code is already in this repo.

### 1. Database & storage (Supabase → SQL editor)

Run [`supabase/week3_auth.sql`](supabase/week3_auth.sql). It creates:

- `public.profiles` (`id` → `auth.users`, `email`, nullable `first_name` / `last_name`, `avatar_url`, `bio`)
- the `on_auth_user_created` trigger that inserts a profile row for every new user
- a public `avatars` storage bucket (5 MB, images only) with policies so users can upload into their own folder

Photos are stored in the bucket; only the URL goes into `profiles.avatar_url`.

### 2. Google OAuth client (Google Cloud Console)

1. APIs & Services → Credentials → **Create credentials → OAuth client ID** (type: *Web application*).
   If asked, configure the OAuth consent screen first (External, add your email as a test user).
2. **Authorized JavaScript origins**: `https://<your-vercel-domain>` and `http://localhost:3000`.
3. **Authorized redirect URIs**: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   (copy the exact value from Supabase → Authentication → Providers → Google → "Callback URL").
4. Copy the Client ID and Client secret.

### 3. Supabase Auth

1. Authentication → **Providers → Google**: enable, paste Client ID / secret, save.
2. Authentication → **URL Configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: add
     - `https://<your-vercel-domain>/auth/callback`
     - `https://*-<team>.vercel.app/auth/callback` (so preview/commit URLs work)
     - `http://localhost:3000/auth/callback`

The app always redirects to **`/auth/callback`** with no extra query params other than the `code` Supabase appends, as the assignment requires.

### 4. Vercel

- Environment variables (already set from week 2): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Settings → **Deployment Protection → Off**, so the page opens in Incognito.
- Submit the **commit-specific** deployment URL.

## How auth works in the code

| File | Role |
|------|------|
| `lib/supabase/client.ts` | browser client (`@supabase/ssr` `createBrowserClient`) |
| `lib/supabase/server.ts` | server client bound to Next cookies |
| `lib/supabase/proxy.ts` + `proxy.ts` | refreshes the session on every request; redirects logged-out users away from `/create`, `/jokes`, `/profile`, `/onboarding`, and users without a first/last name to `/onboarding` |
| `app/auth/callback/route.ts` | exchanges the OAuth `code` for a session cookie |
| `app/login` | "Continue with Google" button (`signInWithOAuth`) |
| `app/onboarding` | asks for first / last name on first login (prefilled from Google) |
| `app/profile` | edit name, bio, upload photo (browser → Storage, URL → `profiles`) |
| `app/actions/profile.ts` | server actions: `updateProfile`, `setAvatarUrl`, `signOut` |
| `app/page.tsx` | gated UI: different content for logged-in vs anonymous visitors |
| `app/jokes` | protected route (login required) |
| `lib/gemini.ts` | server-only Gemini REST client (`GEMINI_API_KEY`) |
| `lib/vibes.ts` | vibe definitions and the daily-theme rotation |
| `lib/posts.ts` | feed / leaderboard queries (joins scores + authors) |
| `app/actions/captions.ts` | server actions: `generateCaptions`, `vote`, `deletePost` |
| `app/create` | upload photo + describe moment + pick vibe → generate |
| `app/p/[id]` | single post: the photo with all its captions and votes |
| `app/race`, `app/components/Race.tsx`, `lib/race.ts` | Race to Columbia: strip map, standings, badges |
| `app/components/MemeCard.tsx` | one caption + photo card used in the feed and leaderboard |
| `app/components/HeaderShell.tsx`, `MobileTabBar.tsx` | header that hides on scroll; bottom tab bar on phones |
| `lib/limits.ts` | daily caption-run limit per account |
| `supabase/week5.sql` | `captions.vibe`, prompt column hidden from clients, `rider_stats` view |
| `app/top` | leaderboard |
| `app/components/PostCard.tsx`, `VoteButtons.tsx` | feed card and the up/down vote control |
| `app/components/LineBullet.tsx` | subway-style bullets for vibes and ranks |
| `app/components/CopyButton.tsx` | copy a caption / share a post |
| `app/p/[id]/OwnerTools.tsx` | "write 3 more captions" and confirm-to-delete |
| `lib/caption-text.ts` | caption cleanup shared by the parser and the feed |
| `lib/resize-image.ts` | in-browser photo resize before upload |
| `lib/safe-next.ts` | same-site check for `?next=` redirects |
| `app/components/ServiceAlert.tsx` | Gemini errors as subway-style service alerts |
| `app/components/NextThemeClock.tsx` | countdown to the next daily theme |
