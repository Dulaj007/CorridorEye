# CorridorEye

A private, secure route-adherence vehicle tracking demo. See
`CorridorEye-Project-Plan.md` in the parent folder for the full project
plan and phase breakdown.

## What it does

- A "system" account watches partner vehicles live on a full-screen map.
- "Vehicle" accounts open the app on a phone browser, press Start, and
  their location is reported every 3 seconds.
- The system account can draw a route on the map, set a corridor width,
  and assign it to a vehicle.
- If an assigned vehicle strays outside its corridor for 3 consecutive GPS
  fixes, the dashboard raises an alert (popup, sound, red marker) until
  acknowledged.

## Prerequisites

- Node.js 18 or later
- A free Neon Postgres database (https://neon.tech). Create a project,
  then copy the connection string shown on the project dashboard. It looks
  like `postgresql://user:password@host/dbname?sslmode=require`.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in your own values:

   ```bash
   cp .env.example .env.local
   ```

   - `DATABASE_URL`: the Neon connection string from the prerequisites step.
   - `JWT_SECRET`: any long random string, used to sign login session
     tokens. Example: run `openssl rand -base64 32` and paste the result.

3. Create the database tables and seed the three demo accounts:

   ```bash
   npm run db:setup
   ```

   This applies `sql/schema.sql` and inserts three users (see
   `sql/seed.sql` for the credential table). It is safe to run more than
   once.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 in your browser.

## Testing on a phone

The Geolocation API (used by the vehicle tracking page) only works over
HTTPS or on `localhost`. To test on a real phone during local development,
either:

- Deploy to Vercel and use the deployed HTTPS URL, or
- Tunnel your local dev server with a tool such as `ngrok` to get a
  temporary HTTPS URL.

## Demo accounts

| username | password | role    |
|----------|----------|---------|
| admin1   | admin123 | system  |
| veh1     | veh123   | vehicle |
| veh2     | veh123   | vehicle |

## Deploying to Vercel

Either path below ends with the same result: an HTTPS URL backed by the
same Neon database you set up locally.

### Option A: Vercel CLI (fastest, no GitHub needed)

```bash
npx vercel login      # opens a browser to authenticate, one time only
npx vercel             # deploys a preview from this directory
npx vercel --prod      # promotes to the production URL
```

The CLI will prompt for `DATABASE_URL` and `JWT_SECRET` the first time, or
set them ahead of time with `npx vercel env add`.

### Option B: GitHub + Vercel dashboard

1. Push this repository to GitHub.
2. Import the project at https://vercel.com/new.
3. Set the `DATABASE_URL` and `JWT_SECRET` environment variables in the
   Vercel project settings (same values as your `.env.local`).
4. Deploy. Every push to the connected branch redeploys automatically.

### After either path

Run `npm run db:setup` once locally (pointed at the same `DATABASE_URL`
used in Vercel) if you have not already -- this only needs to happen once
per database, not once per deploy. Then smoke-test the full demo scenario
from the project plan on the live URL with two real phones.
