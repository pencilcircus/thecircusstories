# The Circus Stories — Coming-soon homepage

Static HTML + Vercel serverless API for the email signup.

## File structure

```
deploy/
├── index.html              # The homepage
├── api/
│   └── signup.js           # POST /api/signup — handles MailerLite + Supabase + Resend
├── games/
│   └── packing/
│       └── index.html      # The packing game (also embedded inline on homepage)
└── README.md               # This file
```

## Required environment variables

Set these in Vercel → Project Settings → Environment Variables.

| Variable | Where to get it | Required |
|---|---|---|
| `MAILERLITE_API_TOKEN` | MailerLite → Profile → Integrations → Developer API | Yes |
| `MAILERLITE_GROUP_ID` | MailerLite → Subscribers → Groups → click group → URL has the ID | Yes |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / public key | Yes |
| `RESEND_API_KEY` | Resend → API Keys → Create API Key | Optional |
| `RESEND_FROM_EMAIL` | The verified sender. Default: `onboarding@resend.dev` | Optional |
| `NOTIFY_EMAIL` | Where signup notifications go. Default: `info@duoillumi.com` | Optional |

## Supabase table

Run this SQL in Supabase → SQL Editor → New query → Run:

```sql
create table email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text default 'homepage',
  created_at timestamptz default now(),
  metadata jsonb
);

create index email_signups_email_idx on email_signups(email);
create index email_signups_created_idx on email_signups(created_at desc);

alter table email_signups enable row level security;

create policy "Allow insert from anywhere"
  on email_signups for insert
  to anon
  with check (true);
```

## Deploy steps

1. Push this folder to a GitHub repo
2. Connect repo to Vercel (`vercel.com/new` → import the repo)
3. Vercel auto-detects it as a static site with serverless functions in `/api`
4. Add the environment variables above in Vercel project settings
5. Deploy
6. Point `thecircusstories.com` DNS at Vercel:
   - In Siteground DNS: add an A record `@` → `76.76.21.21` (Vercel's IP)
   - And a CNAME `www` → `cname.vercel-dns.com`
   - Or follow Vercel's "Add domain" wizard which gives exact records
7. Test signup form — should work end to end

## Testing locally

If you want to test before deploying:
```bash
npm install -g vercel
vercel dev
```
Then open http://localhost:3000

## Notes

- The signup endpoint returns success even if MailerLite or Supabase fail. We don't want to break the form for the user. Errors are logged to the Resend notification email so you'll see them.
- The `metadata` column in Supabase captures IP and user-agent for the signup — useful for spotting bots later.
- If you want to disable Resend notifications, just don't set `RESEND_API_KEY` — the endpoint will skip that step.
