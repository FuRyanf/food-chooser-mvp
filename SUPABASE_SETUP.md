# Supabase Setup Guide for FuDi Food Chooser

This guide will walk you through setting up Supabase as your database backend for the FuDi app.

## Prerequisites

- A Supabase account (free at [supabase.com](https://supabase.com))
- Node.js and npm installed
- Git repository set up

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Fill in project details:
   - **Name**: `fudi-food-chooser` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your users
5. Click "Create new project"
6. Wait for the project to be created (usually 1-2 minutes)

## Step 2: Get Your API Keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like: `https://abcdefghijklmnop.supabase.co`)
   - **anon public** key (starts with `eyJ...`)

## Step 3: Set Up Environment Variables

1. In your project root, copy the example environment file:
   ```bash
   cp env.example .env.local
   ```

2. Edit `.env.local` and add your actual Supabase values:
   ```bash
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Important**: Never commit `.env.local` to git (it's already in `.gitignore`)

## Step 4: Set Up the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click "Run" to execute the SQL

This will create:
- `meals` table for storing dinner history
- `user_preferences` table for budget and settings
- `cuisine_overrides` table for learning user preferences
- Proper indexes and Row Level Security (RLS) policies

## Step 5: Install Dependencies

```bash
npm install
```

This will install the new `@supabase/supabase-js` dependency.

## Step 6: Test the Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open your browser to `http://localhost:5173`
3. The app should now load data from Supabase instead of localStorage
4. Try adding a meal or loading demo data

## Step 7: Verify Database Operations

1. In your Supabase dashboard, go to **Table Editor**
2. You should see your three tables: `meals`, `user_preferences`, `cuisine_overrides`
3. Try adding a meal in the app, then check the `meals` table
4. Update budget settings and check the `user_preferences` table

## Troubleshooting

### Common Issues

**"Missing Supabase environment variables" error**
- Make sure `.env.local` exists and has the correct values
- Restart your dev server after creating `.env.local`

**"Failed to load data" error**
- Check your Supabase project is running
- Verify API keys are correct
- Check the browser console for detailed error messages

**Database connection issues**
- Ensure your Supabase project is not paused
- Check if you've hit any free tier limits
- Verify the SQL schema was executed successfully

### Debug Mode

To see detailed API calls, open your browser's Developer Tools:
1. Press F12
2. Go to Console tab
3. Look for any error messages or API call logs

## Security Notes

- The current setup uses a demo user ID (`demo-user-123`)
- In production, implement proper user authentication
- Row Level Security (RLS) is enabled but basic
- Consider adding more restrictive policies for production use

## Next Steps

Once everything is working:

1. **Add Authentication**: Implement proper user login/signup
2. **Real-time Updates**: Use Supabase's real-time subscriptions
3. **File Storage**: Add image uploads for meals
4. **Backup**: Set up database backups
5. **Monitoring**: Add error tracking and analytics

## Support

If you encounter issues:
1. Check the [Supabase documentation](https://supabase.com/docs)
2. Look at the browser console for error messages
3. Verify your environment variables are set correctly
4. Ensure the database schema was created successfully

## File Structure

After setup, your project will have these new files:
```
food-chooser-mvp/
├── .env.local          # Your Supabase credentials (not in git)
├── env.example         # Template for environment variables
├── .gitignore          # Prevents sensitive files from being committed
├── supabase-schema.sql # Database setup script
├── src/
│   ├── lib/
│   │   ├── supabase.ts # Supabase client configuration
│   │   └── api.ts      # Database API wrapper
│   └── App.tsx         # Updated to use Supabase
└── package.json         # Updated with Supabase dependency
```

Happy coding! 🍕🍜🍔
