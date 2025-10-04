# FuDi

A fun and interactive meal recommendation app built with **React**, **TypeScript**, **Tailwind CSS**, and **Framer Motion**.  
Includes a “Gacha Egg” animation inspired by Puzzles & Dragons — crack open the egg to reveal your meal surprise.

## Features

- Gacha Egg Animation – Rolling, bouncing, and cracking animation before revealing a meal pick.
- Weighted Random Selection – Picks meals based on configurable score weighting.
- Surprise Me – Let the algorithm choose for you, or override manually.
- Meal History – Tracks past chosen meals.
- Travel Log – Track shared travel expenses without cluttering everyday browsing.
- Responsive UI – Works well on desktop and mobile.
- Tier-based Egg Designs – Bronze, Silver, Gold, Diamond with confetti.

## Getting Started

### Clone the repository
```bash
git clone https://github.com/<your-username>/food-chooser-mvp.git
cd food-chooser-mvp
```

### Install dependencies
```bash
npm install
```
Or use:
```bash
yarn install
```
or
```bash
pnpm install
```

### Start the development server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
food-chooser-mvp/
├── public/                # Static assets
│   ├── sfx/               # Sound effects (roll, crack, sparkle)
├── src/
│   ├── components/
│   │   ├── EggGacha.tsx   # Gacha animation component
│   │   ├── MealHistory.tsx
│   │   └── ...
│   ├── App.tsx            # Main app logic
│   └── ...
├── package.json
├── README.md
└── ...
```

## Configuration

- Meal Data – Currently stored locally in browser state. Future improvement could move this to a database or API.
- Tier Colors – Configurable in `TIER_GRADIENT` inside `EggGacha.tsx`.
- Animation Timings – Controlled via `setTimeout` hooks in `EggGacha`.

## Supabase Database Setup

This app uses Supabase as the backend database. The database schema includes tables for meals, user preferences, cuisine overrides, and more.

### 🚨 Supabase Free Tier Database Keepalive

**Why This is Critical:** Supabase free tier databases automatically **pause after 1 week of inactivity**. When paused:
- 🛑 Your app will stop working completely
- 🗃️ Database connections will fail  
- ⏳ Cold starts can take 10+ seconds to resume
- 📱 Users will see connection errors

**The Solution:** This project includes an automated GitHub Action cron job that keeps your database warm by pinging it regularly.

#### 🛠️ Setup Instructions

##### 1. Configure GitHub Repository Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these two repository secrets:

**Secret 1:**
- **Name:** `SUPABASE_URL`
- **Value:** Your Supabase project URL (e.g., `https://mkpmlgdxwzvjkubeptmc.supabase.co`)

**Secret 2:**
- **Name:** `SUPABASE_ANON_KEY`  
- **Value:** Your Supabase anonymous key (starts with `eyJ...`)

**🔍 To find these values:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your **specific project** (not organization settings)
3. Go to **Settings** → **API**
4. Copy the **Project URL** (for `SUPABASE_URL`)
5. Copy the **anon public** key (for `SUPABASE_ANON_KEY`)

##### 2. How the Cron Job Works

The automated workflow (`.github/workflows/keep-supabase-alive.yml`) runs on this schedule:

```yaml
# Smart scheduling to optimize usage
- cron: "*/30 6-23 * * *"  # Every 30 minutes during active hours (6 AM - 11 PM UTC)
- cron: "0 0-5/2 * * *"    # Every 2 hours during off-hours (12 AM - 5 AM UTC)
```

**What it does:**
1. **✅ Environment Validation** - Checks that both secrets are properly configured
2. **🏥 REST API Health Check** - Pings `/rest/v1/` to verify the API is responding  
3. **🔥 Database Warmup** - Queries your `user_preferences` table to keep PostgREST connections warm
4. **📊 Detailed Logging** - Reports success/failure with HTTP status codes and response data

**Benefits:**
- 🚀 Prevents database pausing
- ⚡ Eliminates cold start delays
- 🔒 Uses lightweight, safe read-only queries
- 💰 Minimizes resource usage during off-hours
- 🛡️ Built-in error handling and retry logic

##### 3. Testing & Monitoring

**Manual Testing:**
1. Go to your GitHub repository → **Actions** tab
2. Look for **"Keep Supabase Database Alive"** workflow
3. Click **"Run workflow"** → **"Run workflow"** to test immediately

**Automatic Monitoring:**
- Check the **Actions** tab regularly to view cron job runs
- ✅ **Green checkmarks** = Successful keepalive
- ❌ **Red X marks** = Failed runs (check logs for issues)  
- 🟡 **Yellow circles** = Currently running

**Troubleshooting:**
- If you see 401 errors, verify your `SUPABASE_ANON_KEY` is correct
- If you see 404 errors, verify your `SUPABASE_URL` is correct
- Check that both secrets are added to your repository (not organization) settings

##### 4. Cost & Usage Impact

This keepalive strategy is designed to be **free-tier friendly**:
- Uses only 2-3 KB of bandwidth per ping
- Makes simple read queries that don't affect your database limits  
- Reduces pings during off-hours to conserve resources
- Prevents the much more expensive cost of database cold starts

**Without keepalive:** Users face 10+ second delays when your database resumes from pause.  
**With keepalive:** Your app stays responsive 24/7. 🎯

## Build for Production
```bash
npm run build
```
The build output will be in the `dist/` folder.

## Tech Stack

- React + TypeScript
- Tailwind CSS
- Framer Motion
- Lucide React Icons
- Vite

## License

MIT License © 2025 [Ryan Fu]
