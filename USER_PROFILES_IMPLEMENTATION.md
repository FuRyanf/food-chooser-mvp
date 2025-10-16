# 👤 User Profiles & Display Names - Implementation Guide

## Overview

This feature adds user profiles with display names that:
- Are set during onboarding
- Can be updated in settings
- Default as the "purchaser" name in meal and grocery entries
- Are tied to the user's auth account (not household)

---

## 🗄️ Database Changes

### 1. Run the SQL Migration

Execute `add-user-profiles.sql` in your Supabase SQL Editor:

```sql
-- Creates profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies for profiles
-- Auto-create profile on user signup
-- Trigger uses email prefix as default name
```

---

## ✅ What's Implemented

### 1. Database Schema ✅
- `profiles` table created with RLS policies
- Trigger to auto-create profile on user signup
- Default name = email prefix (e.g., "ryan" from "ryan@email.com")

### 2. TypeScript Types ✅
- Added `profiles` types to `src/lib/supabase.ts`
- `Row`, `Insert`, and `Update` types defined

### 3. Profile Context ✅
- Created `src/contexts/ProfileContext.tsx`
- Provides `displayName`, `updateDisplayName`, and `loading`
- Fetches profile on auth
- Falls back to email prefix if no profile

### 4. Onboarding Flow ✅
- Added "Your Name" field to household creation
- Creates/updates profile when creating household
- Required field (cannot proceed without name)
- Bilingual support (EN/中文)

---

## 🚧 Still To Implement

### 1. Profile Settings UI
Add to `HouseholdSettings.tsx`:
```typescript
// Add this section before household members
<div className="card">
  <h2>Your Profile</h2>
  <label>Display Name</label>
  <input 
    value={displayName} 
    onChange={(e) => setDisplayName(e.target.value)} 
  />
  <button onClick={handleUpdateName}>Update Name</button>
</div>
```

### 2. Default Purchaser Name
Update meal/grocery forms in `App.tsx`:
```typescript
// In meal form state
const [purchaserName, setPurchaserName] = useState(displayName || 'Unknown')

// In grocery form state  
const [purchaserName, setPurchaserName] = useState(displayName || 'Unknown')

// Use useProfile hook
const { displayName } = useProfile()
```

### 3. Wire Up Profile Provider
In `src/main.tsx` or `src/App.tsx`:
```typescript
import { ProfileProvider } from './contexts/ProfileContext'

<AuthProvider>
  <ProfileProvider>
    <App />
  </ProfileProvider>
</AuthProvider>
```

---

## 🎯 User Flow

### New User Sign Up
1. Sign in with Google
2. Onboarding screen asks for:
   - **Your Name** (e.g., "Ryan")
   - Household Name
3. Profile created with display name
4. Name defaults in all meal/grocery entries

### Updating Name
1. Go to Household Settings
2. Find "Your Profile" section
3. Update display name
4. All future entries use new name

---

## 📝 Notes

- Display name is **per user**, not per household
- Each household member has their own name
- Can still enter meals for other people (override the default)
- Falls back to email prefix if profile not set

---

## 🚀 Deployment Steps

1. **Run SQL migration** in Supabase
2. **Deploy code** changes
3. **Test** with new user signup
4. **Verify** name appears in forms

---

## 🔧 Troubleshooting

### Profile not loading?
- Check RLS policies in Supabase
- Verify trigger is active
- Check browser console for errors

### Name not defaulting in forms?
- Ensure ProfileProvider is wrapping App
- Check `useProfile()` hook is called
- Verify displayName is being passed to forms

---


