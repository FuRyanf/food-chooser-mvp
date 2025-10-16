# 🛠️ FuDi Setup Guide

This guide walks you through setting up FuDi from scratch. For quick start, see the main [README.md](README.md).

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm or yarn package manager
- [ ] A [Supabase](https://supabase.com) account (free tier)
- [ ] A [Google Cloud Console](https://console.cloud.google.com) account

---

## 🗄️ Database Setup (Supabase)

### Step 1: Create Supabase Project
1. Sign in to [supabase.com](https://supabase.com)
2. Click **New Project**
3. Fill in:
   - **Name**: `fudi` (or any name)
   - **Database Password**: Generate or create a strong password (save it!)
   - **Region**: Choose closest to you
4. Click **Create new project** and wait ~2 minutes

### Step 2: Get Your API Credentials
1. In your Supabase project, go to **Settings** → **API**
2. Copy the following (you'll need these shortly):
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public** key (under "Project API keys")

### Step 3: Run Database Setup Script
1. In Supabase Dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open the file `database-setup-complete.sql` from your project
4. Copy and paste the entire contents into the SQL editor
5. Click **Run** (or press Cmd+Enter / Ctrl+Enter)
6. You should see: ✅ "Success. No rows returned"

This script creates:
- All database tables (meals, groceries, preferences, etc.)
- Household system (for shared accounts)
- Authentication trigger (auto-creates household on signup)
- Helper functions for bypassing RLS issues

### Step 4: Verify Setup
Run this query in SQL Editor to verify tables were created:
```sql
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

You should see:
- `cuisine_overrides`
- `disabled_items`
- `groceries`
- `household_members`
- `households`
- `meals`
- `user_preferences`

---

## 🔐 Google OAuth Setup

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown → **New Project**
3. Name it `FuDi` (or anything you like)
4. Click **Create**
5. Wait for project creation, then select it

### Step 2: Configure OAuth Consent Screen
1. In the left sidebar, go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type
3. Click **Create**
4. Fill in required fields:
   - **App name**: `FuDi`
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **Save and Continue** through all steps
6. On **Scopes** screen, click **Save and Continue** (don't add scopes)
7. On **Test users** screen, click **Save and Continue** (optional)
8. Click **Back to Dashboard**

### Step 3: Create OAuth Client ID
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Name it `FuDi Web Client`
5. Under **Authorized JavaScript origins**, click **Add URI**:
   ```
   http://localhost:5173
   ```
   If you're deploying to production, also add:
   ```
   https://your-app-name.vercel.app
   ```
6. Under **Authorized redirect URIs**, click **Add URI**:
   ```
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```
   ⚠️ **IMPORTANT**: Replace `YOUR_PROJECT_ID` with your actual Supabase project ID
   
   Example: If your Supabase URL is `https://abc123xyz.supabase.co`, then use:
   ```
   https://abc123xyz.supabase.co/auth/v1/callback
   ```
7. Click **Create**
8. 📋 **Copy the Client ID and Client Secret** (you'll need these next)

### Step 4: Enable Google Auth in Supabase
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Providers** (left sidebar)
3. Find **Google** in the list
4. Toggle it **ON** (green)
5. Paste your **Client ID** from Google
6. Paste your **Client Secret** from Google
7. **Uncheck** "Skip nonce checks" (leave it checked for better security)
8. **Uncheck** "Allow users without an email" (we need emails)
9. Click **Save**

---

## ⚙️ Local Development Setup

### Step 1: Clone Repository
```bash
git clone https://github.com/your-username/food-chooser-mvp.git
cd food-chooser-mvp
```

### Step 2: Install Dependencies
```bash
npm install
```
Or if you use yarn:
```bash
yarn install
```

### Step 3: Configure Environment Variables
```bash
# Copy the example file
cp env.example .env.local
```

Edit `.env.local`:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key
```

Replace with the credentials from **Database Setup Step 2**.

### Step 4: Start Development Server
```bash
npm run dev
```

The app should open at [http://localhost:5173](http://localhost:5173)

### Step 5: Test Authentication
1. Click **Sign in with Google**
2. Choose your Google account
3. Allow permissions
4. You should be redirected back to FuDi
5. You should see: "Loading your delicious experience..."
6. Then: Your household dashboard!

🎉 **Success!** You're now authenticated and have a fresh household.

---

## 🚀 Production Deployment (Vercel)

### Option 1: One-Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Option 2: Manual Deploy
1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Go to [vercel.com](https://vercel.com) and sign in

3. Click **Add New** → **Project**

4. Import your GitHub repository

5. Configure:
   - **Framework Preset**: Vite (should auto-detect)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

6. Add Environment Variables:
   ```
   VITE_SUPABASE_URL = https://YOUR_PROJECT_ID.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGc...your-key
   ```

7. Click **Deploy**

8. Wait ~2 minutes for deployment

9. Copy your production URL (e.g., `https://fudi.vercel.app`)

### Step 2: Update Google OAuth for Production
1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to **APIs & Services** → **Credentials**
3. Click on your **OAuth 2.0 Client ID**
4. Under **Authorized JavaScript origins**, add:
   ```
   https://your-app.vercel.app
   ```
5. Click **Save**
6. ⏰ Wait 5-10 minutes for changes to propagate

### Step 3: Test Production
1. Go to your production URL
2. Sign in with Google
3. Verify everything works!

---

## ✅ Setup Verification Checklist

After completing setup, verify:
- [ ] Local dev server runs (`npm run dev`)
- [ ] Google sign-in works
- [ ] You're redirected back after OAuth
- [ ] Household dashboard loads
- [ ] You can add a test meal
- [ ] Meal appears in history
- [ ] Grocery tracking works
- [ ] Preferences can be edited
- [ ] Gacha egg animation works
- [ ] "Surprise Me" gives recommendations
- [ ] No console errors in browser

---

## 🐛 Common Issues & Solutions

### "redirect_uri_mismatch" Error
**Problem**: OAuth redirect URI doesn't match Google configuration

**Solution**:
1. Check your Supabase project URL
2. Ensure Google OAuth redirect URI is **exactly**:
   ```
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```
3. Wait 5-10 minutes after updating Google settings

### "Database error saving new user"
**Problem**: Trigger failed to create household

**Solution**:
1. Re-run `database-setup-complete.sql`
2. Check Supabase Logs: Dashboard → Logs → Postgres Logs
3. Look for trigger execution errors

### Stuck on "Loading your delicious experience..."
**Problem**: Can't fetch household data

**Solution**:
1. Check browser console for errors
2. Verify `.env.local` has correct credentials
3. Check Supabase Logs for query errors
4. Ensure `get_user_household` RPC function exists:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name = 'get_user_household';
   ```

### "Failed to fetch" or Network Errors
**Problem**: Can't connect to Supabase

**Solution**:
1. Verify Supabase project is active (not paused)
2. Check `VITE_SUPABASE_URL` in `.env.local`
3. Restart dev server: `Ctrl+C`, then `npm run dev`
4. Check your internet connection

### Environment Variables Not Working
**Problem**: Changes to `.env.local` don't take effect

**Solution**:
1. Restart dev server (Vite doesn't hot-reload env vars)
2. Ensure file is named `.env.local` (not `.env`)
3. Verify no extra spaces in variable assignments
4. Check file is in project root (same level as `package.json`)

---

## 📚 Next Steps

After successful setup:
1. **Add your first meal** - Test the gacha egg!
2. **Set your budget** - Go to preferences
3. **Invite household members** - Share household ID
4. **Customize settings** - Explore all tabs
5. **Read the main README** - Learn advanced features

---

## 💡 Tips

- **Development**: Use `npm run dev` for hot-reloading
- **Production**: Always test on Vercel preview deployments first
- **Database**: Bookmark Supabase SQL Editor for quick queries
- **Debugging**: Browser DevTools → Console for client-side errors
- **Logs**: Supabase Dashboard → Logs for server-side errors

---

## 📞 Need Help?

If you're stuck:
1. Check the **Troubleshooting** section above
2. Review browser console for errors
3. Check Supabase logs for database errors
4. Open an issue on GitHub with:
   - Error message
   - Steps to reproduce
   - Browser console output
   - Supabase logs (if relevant)

---

**Happy cooking! 🍜✨**

