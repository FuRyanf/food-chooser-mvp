# Supabase Google Authentication Setup Guide

This guide will walk you through enabling Google OAuth authentication for your FuDi app.

## Prerequisites

- ✅ Supabase project created
- ✅ Database schema applied (`add-authentication-schema.sql`)
- ✅ Google account for Google Cloud Console

## Step 1: Set Up Google OAuth Credentials

### 1.1 Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Create a new project OR select an existing one:
   - Click the project dropdown at the top
   - Click **"New Project"**
   - Name it: `FuDi Auth` (or your preferred name)
   - Click **"Create"**

### 1.2 Enable Google+ API (Required for OAuth)

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on it and click **"Enable"**
4. Wait for it to be enabled (takes a few seconds)

### 1.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type (unless you have Google Workspace)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: `FuDi`
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click **"Save and Continue"**
6. **Scopes**: Click **"Save and Continue"** (default scopes are fine)
7. **Test users** (optional): Add test email addresses if needed
8. Click **"Save and Continue"**
9. Review and click **"Back to Dashboard"**

### 1.4 Create OAuth Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. Application type: **Web application**
4. Name: `FuDi Web Client`
5. **Authorized JavaScript origins**:
   - Add: `http://localhost:5173` (for local development)
   - Add: `https://your-vercel-app.vercel.app` (your production URL)
   
6. **Authorized redirect URIs**:
   - Add: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
   
   ⚠️ **Important**: Replace `YOUR_PROJECT_ID` with your actual Supabase project ID.
   
   To find your project ID:
   - Go to Supabase Dashboard
   - Your URL is: `https://supabase.com/dashboard/project/YOUR_PROJECT_ID`
   - Or check your `VITE_SUPABASE_URL` - it's the first part: `https://YOUR_PROJECT_ID.supabase.co`

7. Click **"Create"**

8. **Copy your credentials**:
   - 📋 **Client ID**: `1234567890-abcdefg.apps.googleusercontent.com`
   - 🔑 **Client Secret**: `GOCSPX-abc123...`
   
   ⚠️ **Save these!** You'll need them in the next step.

## Step 2: Configure Supabase Authentication

### 2.1 Enable Google Provider

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your FuDi project
3. Go to **Authentication** → **Providers**
4. Scroll down to **Google**
5. Toggle **"Enable Sign in with Google"** to ON

### 2.2 Add Google OAuth Credentials

1. Paste your **Client ID** from Google Cloud Console
2. Paste your **Client Secret** from Google Cloud Console
3. Click **"Save"**

### 2.3 Verify Redirect URL

1. Check that the **Redirect URL** shown matches what you added to Google Cloud Console
2. It should be: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
3. If it doesn't match, go back to Google Cloud Console and update your redirect URIs

## Step 3: Test Authentication Locally

### 3.1 Start Your Development Server

```bash
npm run dev
```

### 3.2 Test Login Flow

1. Open `http://localhost:5173`
2. You should see the login screen
3. Click **"Sign in with Google"**
4. You should be redirected to Google OAuth
5. Select your Google account
6. Grant permissions
7. You should be redirected back to your app, now authenticated! 🎉

### 3.3 Verify Database Records

Check that your authentication created the proper records:

1. Go to Supabase Dashboard → **Table Editor**
2. Check `auth.users` table - you should see your user
3. Check `households` table - a household should be created
4. Check `household_members` table - you should be linked to the household

## Step 4: Deploy to Vercel

### 4.1 Add Production Redirect URI

After deploying to Vercel (you'll get a URL like `https://your-app.vercel.app`):

1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized JavaScript origins**, add:
   - `https://your-app.vercel.app`
5. Under **Authorized redirect URIs**, ensure you have:
   - `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
6. Click **"Save"**

### 4.2 Test Production

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Click **"Sign in with Google"**
3. Authenticate
4. You should be logged in! 🚀

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Problem**: The redirect URI doesn't match what's configured in Google Cloud Console

**Solution**:
1. Check the error message for the actual redirect URI being used
2. Go to Google Cloud Console → Credentials
3. Add the exact URI shown in the error message
4. Wait 5 minutes for changes to propagate
5. Try again

### Error: "Access blocked: This app's request is invalid"

**Problem**: OAuth consent screen not properly configured

**Solution**:
1. Go to Google Cloud Console → OAuth consent screen
2. Ensure all required fields are filled
3. Make sure app is not in "Testing" mode with restricted users
4. Add your email to test users if in testing mode

### Error: "Error creating household"

**Problem**: Database schema not applied or RLS policies preventing insert

**Solution**:
1. Verify `add-authentication-schema.sql` was run in Supabase SQL Editor
2. Check that the trigger `on_auth_user_created` exists
3. Go to Supabase Dashboard → Database → Functions
4. Verify `create_household_for_new_user` function exists

### Users Can't See Each Other's Data

**Problem**: RLS policies are working correctly! This is by design.

**Solution**: 
- Each user gets their own household automatically
- To share data, users need to be in the same household
- Currently requires manual database update (see Advanced section)

### Authentication Works but App Shows Errors

**Problem**: App.tsx not updated to pass householdId to API calls

**Solution**:
1. Make sure you've updated all FoodChooserAPI calls in App.tsx
2. All API methods now require `householdId` as first parameter
3. Use `const { householdId } = useAuth()` in your components
4. Pass it to all API calls: `FoodChooserAPI.getMeals(householdId)`

## Advanced: Manually Add Users to Same Household

To manually add a second user to an existing household:

```sql
-- 1. Find the household ID you want to add the user to
SELECT id, name FROM households;

-- 2. Find the user ID of the person you want to add
SELECT id, email FROM auth.users;

-- 3. Add them to the household
INSERT INTO household_members (household_id, user_id, role)
VALUES ('HOUSEHOLD_ID_HERE', 'USER_ID_HERE', 'member');
```

**Future Enhancement**: Build an invitation system with email invites or shareable links.

## Security Notes

✅ **Safe to expose**:
- Google Client ID
- Supabase URL
- Supabase anon key

🚫 **Never expose**:
- Google Client Secret (stored in Supabase, not in your code)
- Supabase service role key

✅ **Row Level Security (RLS)** is enabled on all tables, ensuring:
- Users can only see their household's data
- Data is completely isolated between households
- Even if someone has your database URL, they can't access other households' data

## Testing Checklist

- [ ] Can sign in with Google
- [ ] Household is created automatically
- [ ] Can see main app after login
- [ ] Can add meals and see them persist
- [ ] Can view household settings
- [ ] Can update household name
- [ ] Can sign out successfully
- [ ] After signing back in, data is still there
- [ ] Production deployment works with Google OAuth

## Next Steps

After authentication is working:

1. **Implement Invitation System** - Allow users to invite others via email
2. **Add More OAuth Providers** - Apple, Facebook, etc.
3. **Add Email Verification** - Require email confirmation
4. **Activity Feed** - Show "Alice added pizza" notifications
5. **User Preferences** - Individual settings within shared household

---

**Need Help?**

- 📚 [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- 🔐 [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- 💬 [Supabase Discord Community](https://discord.supabase.com/)

Congratulations! Your app now has secure, multi-user Google authentication! 🎉

