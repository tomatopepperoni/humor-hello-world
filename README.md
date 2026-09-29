# humor-hello-world

Weekly assignment app for COMS 6998 *Design for Generative AI* (Fall 2026).
Next.js (App Router) + Supabase, deployed on Vercel.

| Week | What was added |
|------|----------------|
| 1 | Hello World page, Vercel deploy |
| 2 | Supabase `jokes` table, `/jokes` list page |
| 3 | Google login (Supabase Auth), `profiles` table + trigger, onboarding, `/profile` with photo upload, protected `/jokes` route |

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the two Supabase values
npm run dev
```

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
| `lib/supabase/proxy.ts` + `proxy.ts` | refreshes the session on every request; redirects logged-out users away from `/jokes`, `/profile`, `/onboarding`, and users without a first/last name to `/onboarding` |
| `app/auth/callback/route.ts` | exchanges the OAuth `code` for a session cookie |
| `app/login` | "Continue with Google" button (`signInWithOAuth`) |
| `app/onboarding` | asks for first / last name on first login (prefilled from Google) |
| `app/profile` | edit name, bio, upload photo (browser → Storage, URL → `profiles`) |
| `app/actions/profile.ts` | server actions: `updateProfile`, `setAvatarUrl`, `signOut` |
| `app/page.tsx` | gated UI: different content for logged-in vs anonymous visitors |
| `app/jokes` | protected route (login required) |
