# 🍜 FuDi - Your Personalized Meal Companion

A smart, fun meal recommendation app with **Gacha Egg** animations, budget tracking, and shared household accounts. Built with **React**, **TypeScript**, **Tailwind CSS**, **Framer Motion**, and **Supabase**.

## ✨ Features

### 🎰 Smart Meal Selection
- **Gacha Egg Animation** - Puzzle & Dragons-inspired egg crack animation
- **Weighted Algorithm** - Considers rating, recency, weather, and budget
- **Tier System** - Bronze, Silver, Gold, Diamond eggs with confetti
- **"Surprise Me"** - Let the app decide, or choose manually

### 📊 Expense Tracking
- **Meal History** - Track all your dining expenses
- **Grocery Spending** - Separate grocery tracking with person attribution
- **Travel Mode** - Tag travel expenses separately
- **Monthly Budgets** - Set and monitor spending limits
- **Spending Summary** - Visual charts and analytics

### 👥 Household Accounts
- **Google OAuth** - Secure one-click authentication
- **Shared Data** - Multiple Google accounts share one household
- **Person Tracking** - See who paid for what
- **Member Management** - Add/remove household members

### 🌡️ Contextual Recommendations
- **Weather-Aware** - Suggests hot/cold meals based on weather
- **Budget-Conscious** - Stays within your price range
- **Recency Tracking** - Avoids recently eaten meals
- **Cuisine Learning** - Remembers your preferences

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ installed
- [Supabase](https://supabase.com) account (free tier works!)
- [Google Cloud Console](https://console.cloud.google.com) account (for OAuth)

### 2. Clone & Install
```bash
git clone https://github.com/your-username/food-chooser-mvp.git
cd food-chooser-mvp
npm install
```

### 3. Set Up Supabase

#### A. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for provisioning (~2 minutes)
3. Go to **Settings** → **API**
4. Copy your **Project URL** and **anon public key**

#### B. Run Database Setup
1. Go to Supabase Dashboard → **SQL Editor**
2. Create a **New Query**
3. Copy the contents of `database-setup-complete.sql`
4. Click **Run** to execute

This creates:
- ✅ All tables (meals, groceries, preferences, etc.)
- ✅ Household authentication system
- ✅ Auto-household creation trigger
- ✅ Helper functions

#### C. Configure Environment Variables
```bash
# Copy the example file
cp env.example .env.local

# Edit .env.local with your Supabase credentials
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Set Up Google OAuth

#### A. Create OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Go to **APIs & Services** → **OAuth consent screen**
   - User type: **External**
   - App name: `FuDi`
   - Add your email
   - Save and continue through all steps
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth client ID**
6. Application type: **Web application**
7. Add **Authorized JavaScript origins**:
   ```
   http://localhost:5173
   https://your-app-name.vercel.app
   ```
8. Add **Authorized redirect URIs**:
   ```
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```
   ⚠️ Replace `YOUR_PROJECT_ID` with your actual Supabase project ID
9. Click **Create** and copy the **Client ID** and **Client Secret**

#### B. Configure Supabase Auth
1. Go to Supabase Dashboard → **Authentication** → **Providers**
2. Find **Google** and toggle it **ON**
3. Paste your **Client ID** and **Client Secret**
4. Click **Save**

### 5. Start the App
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with Google! 🎉

---

## 📂 Project Structure

```
food-chooser-mvp/
├── src/
│   ├── components/
│   │   ├── EggGacha.tsx           # Gacha egg animation
│   │   ├── SpendingSummary.tsx    # Spending charts
│   │   ├── Login.tsx              # Google OAuth login
│   │   ├── AuthenticatedApp.tsx   # Auth wrapper
│   │   └── HouseholdSettings.tsx  # Household management
│   ├── contexts/
│   │   └── AuthContext.tsx        # Authentication state
│   ├── lib/
│   │   ├── api.ts                 # Supabase API layer
│   │   ├── supabase.ts            # Supabase client & types
│   │   └── i18n.ts                # Internationalization (EN/中文)
│   ├── App.tsx                    # Main app component
│   └── main.tsx                   # React entry point
├── public/
│   ├── sfx/                       # Sound effects
│   └── fudi.png                   # Logo
├── database-setup-complete.sql    # Complete DB setup
├── add-person-tracking.sql        # Person tracking feature
├── vercel.json                    # Vercel deployment config
└── .env.local                     # Your environment variables (not in git)
```

---

## 🎮 How to Use

### Adding Meals
1. **Surprise Me** - Click the egg to get a random recommendation
2. **Manual Entry** - Click "+ Log Meal" to add a specific meal
3. **History** - View and edit past meals in the Browse tab

### Tracking Groceries
1. Go to **Contributions** tab
2. Add grocery purchases with amounts
3. Tag with purchaser name (Ryan, Rachel, etc.)
4. Travel expenses can be tagged separately

### Setting Preferences
1. Edit **Budget Range** (min/max per meal)
2. Set **No Repeat Days** (avoid recently eaten meals)
3. Adjust **Monthly Budget** for overall tracking

### Household Management
1. Go to **Household** tab
2. View members and roles
3. Rename your household
4. Share household ID with others to invite

---

## 🚢 Deployment to Vercel

### One-Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Manual Deployment
1. Push your code to GitHub/GitLab
2. Connect to [Vercel](https://vercel.com)
3. Import your repository
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

### After Deployment
Update Google OAuth redirect URIs with your production URL:
```
https://your-app.vercel.app
```

---

## 🔧 Development

### Available Scripts
```bash
npm run dev      # Start development server (port 5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Build**: Vite
- **Deployment**: Vercel

### Database Schema
See `database-setup-complete.sql` for the complete schema including:
- `meals` - Dining history
- `groceries` - Grocery purchases
- `user_preferences` - Budget & preferences
- `cuisine_overrides` - Learned preferences
- `disabled_items` - Hidden dishes
- `households` - Shared accounts
- `household_members` - User-household links

---

## 🌍 Internationalization

FuDi supports **English** and **中文** (Traditional Chinese):
- Click the language toggle in the header
- Translations stored in `src/lib/i18n.ts`
- Supports dynamic text interpolation

---

## 🔐 Security & Privacy

### Authentication
- ✅ Google OAuth 2.0 (industry standard)
- ✅ Supabase handles all auth flows
- ✅ No passwords to manage
- ✅ Automatic session management

### Data Security
- ✅ Row Level Security (RLS) on all tables
- ✅ Data isolated between households
- ✅ Server-side validation
- ✅ HTTPS everywhere

### Privacy
- ✅ Only household members see shared data
- ✅ No data sold or shared with third parties
- ✅ Minimal data collection (meals, preferences only)

---

## 🎨 Customization

### Changing Colors
Edit `tailwind.config.js` to customize the color scheme.

### Adding Cuisines
Cuisines are automatically learned from your meal entries!

### Sound Effects
Replace files in `public/sfx/`:
- `egg-crack.wav` - Egg cracking sound

### Tier Thresholds
Edit `deriveTier()` function in `App.tsx`:
```typescript
function deriveTier(cost:number): EggTier { 
  if (cost<15) return 'Bronze';
  if (cost<30) return 'Silver';
  if (cost<55) return 'Gold';
  return 'Diamond';
}
```

---

## 🐛 Troubleshooting

### "Database error saving new user"
- Ensure `database-setup-complete.sql` was run completely
- Check Supabase logs: Dashboard → Logs → Postgres Logs

### "Stuck on loading screen"
- Verify environment variables are set correctly
- Check browser console for errors
- Ensure Google OAuth redirect URIs match

### "No data showing after login"
- You start with a fresh household - add your first meal!
- Check browser console for API errors

### "redirect_uri_mismatch"
- Google OAuth redirect URI must be: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
- Wait 5 minutes after updating in Google Cloud Console

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- Gacha animation inspired by [Puzzle & Dragons](https://www.puzzleanddragons.us/)
- Weather data from [Open-Meteo](https://open-meteo.com/)
- Icons from [Lucide](https://lucide.dev/)

---

## 🤝 Contributing

This is a personal project, but suggestions and bug reports are welcome!
Open an issue or submit a pull request.

---

## 📧 Support

For questions or issues:
1. Check the troubleshooting section above
2. Review archived docs in `docs/archive/`
3. Open a GitHub issue

---

**Made with ❤️ for better meal decisions** 🍜✨
