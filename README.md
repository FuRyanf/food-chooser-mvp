# FuDi

A fun and interactive meal recommendation app built with **React**, **TypeScript**, **Tailwind CSS**, and **Framer Motion**.  
Includes a “Gacha Egg” animation inspired by Puzzles & Dragons — crack open the egg to reveal your meal surprise.

## Features

- Gacha Egg Animation – Rolling, bouncing, and cracking animation before revealing a meal pick.
- Weighted Random Selection – Picks meals based on configurable score weighting.
- Surprise Me – Let the algorithm choose for you, or override manually.
- Meal History – Tracks past chosen meals.
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

### Setting up Supabase Keepalive (Free Tier)

Since Supabase free tier databases can go to sleep after periods of inactivity, this project includes a GitHub Action that automatically keeps your database alive.

#### 1. Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these repository secrets:

- **`SUPABASE_URL`** - Your Supabase project URL (e.g., `https://your-project-id.supabase.co`)
- **`SUPABASE_ANON_KEY`** - Your Supabase anonymous key

**To find these values:**
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **Project URL** (for `SUPABASE_URL`)
5. Copy the **anon public** key (for `SUPABASE_ANON_KEY`)

#### 2. How the Keepalive Works

The GitHub Action (`.github/workflows/keep-supabase-alive.yml`) runs automatically:

- **Every 30 minutes** during active hours (6 AM - 11 PM UTC)
- **Every 2 hours** during off-hours (12 AM - 5 AM UTC)

The workflow performs two types of health checks:
1. **Auth Health Check** - Pings the Supabase auth service
2. **Database Query** - Makes a lightweight query to your `user_preferences` table to keep PostgREST warm

#### 3. Manual Testing

You can manually trigger the keepalive workflow:
1. Go to your GitHub repository → **Actions** tab
2. Click on **"Keep Supabase Database Alive"**
3. Click **"Run workflow"** → **"Run workflow"**

#### 4. Monitoring

Check the **Actions** tab in your GitHub repository to see the keepalive runs. Each run will show:
- ✅ Successful pings and database queries
- ⚠️ Any failures or issues
- 📊 Response data from your database

The workflow automatically handles retries and provides detailed logging to help debug any issues.

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
