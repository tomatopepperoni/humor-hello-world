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
| 5 | Iteration: fixed truncated Gemini output, subway-sign redesign, copy/share captions, "write 3 more" for owners, profile with your posts and points, loading/error/404 screens |

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the two Supabase values + GEMINI_API_KEY
npm run dev
```

## Week 5 – Get feedback and iterate

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
  3 usable, distinct captions; anything less is retried like a 5xx (same model, then
  the next model), with an overall 50 s deadline.
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
- Owners get **Write 3 more captions** in any vibe (the prompt lists the existing
  captions so they aren't repeated; max 9 per post) and a two-step delete.
- Create: drag-and-drop or tap upload, photos resized to ≤1600 px JPEG in the browser
  (phone photos upload faster and fit the bucket), vibe cards that say what each vibe
  does, a progress view while Gemini works, and errors that say what to do next.
- Profile: your posts with points, totals (posts, points earned, votes cast), sign-out.
- Sign-in page says why you're there ("Sign in to vote on this post") and returns you
  to it afterwards; `/login?next=` only accepts same-site paths.
- Loading skeleton, error screen with retry, and a 404 page.
- Vote buttons have clear labels, `aria-pressed`, and stay in sync when the same caption
  is on screen twice.

**Visual design**
- One visual language taken from NYC subway signage: black sign bands with a thin white
  rule, the four vibes as line bullets (O, R, M, C), MetroCard yellow for the one primary
  action on each screen, green/grey for up/down votes. Geist for all type.
- Captions are the largest text on a card. Phone layout puts the caption first and the
  vote/copy row under it.

### Feedback group notes

_Add the PM's and group's comments from this week's session here._

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
  every caption row** and visible under "Prompt" on each post page.
- **Vote** (`VoteButtons` → server action `vote`): inserts a row in `votes`
  (`caption_id`, `user_id`, `value ∈ {-1, 1}`, unique per user+caption). Clicking the
  same arrow again deletes the row, the other arrow updates it. Optimistic UI, then
  `router.refresh()`. Logged-out users are sent to `/login?next=…`.
- **Feed** (`/`): today's theme hero, "Top today" (themed posts ranked by total
  caption score), "Fresh" (latest 20). **Leaderboard** (`/top`): top posts today +
  best captions of all time. **Post page** (`/p/[id]`): captions, votes, prompt, and
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

Totals are exposed through the `caption_scores` view and names/avatars through the
`public_profiles` view (both `security_invoker = false`), so nobody can read other
users' individual votes, emails or bios. Storage: `photos` bucket is public-read,
upload/delete only inside `<user id>/`.

### Setup (one-time)

1. Supabase → SQL editor → run `supabase/week4_rating.sql`.
2. Get a free Gemini key at https://aistudio.google.com/apikey.
3. Add `GEMINI_API_KEY` to `.env.local` and to Vercel → Settings → Environment Variables, then redeploy.

### Feedback group session – PM notes and what changed

Notes from the session with my PM, and the iteration that followed:

1. **"I'd never type a description if I already have a photo – make the text optional."**
   → Photo *or* text is enough; the Generate button stays disabled until one exists.
2. **"The captions all sound the same, like a brand account."**
   → Replaced the single prompt with four vibes, each a separate instruction block,
   and told the model to give each of the three captions a different angle.
3. **"Why would I come back tomorrow?"**
   → Added the daily theme (rotates at midnight NY time), the opt-in "enter today's
   theme" checkbox on the create form, and the "Top today" board that only counts
   themed posts from today.
4. **"I clicked upvote twice and it just stayed orange."**
   → Second click on the same arrow now removes the vote (row deleted), switching
   arrows updates the row; the score updates optimistically.
5. **"Let me look before I log in."**
   → The feed and leaderboard are public; only `/create` and voting require login,
   and the vote buttons send you to `/login?next=<current page>`.
6. **"Show me the prompt – I want to know what it was told."**
   → Each caption on the post page has a collapsible "Prompt · model" panel.
7. **"Roast mode shouldn't be able to be mean about how someone looks."**
   → Roast instruction explicitly limits roasting to the situation / choices, and the
   Gemini harassment safety threshold is left on (`BLOCK_ONLY_HIGH`).

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
| `app/p/[id]` | single post with captions, votes and the saved prompt |
| `app/top` | leaderboard |
| `app/components/PostCard.tsx`, `VoteButtons.tsx` | feed card and the up/down vote control |
| `app/components/LineBullet.tsx` | subway-style bullets for vibes and ranks |
| `app/components/CopyButton.tsx` | copy a caption / share a post |
| `app/p/[id]/OwnerTools.tsx` | "write 3 more captions" and confirm-to-delete |
| `lib/caption-text.ts` | caption cleanup shared by the parser and the feed |
| `lib/resize-image.ts` | in-browser photo resize before upload |
| `lib/safe-next.ts` | same-site check for `?next=` redirects |
