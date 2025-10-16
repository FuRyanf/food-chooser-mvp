# Authentication Integration Checklist

Use this checklist to integrate authentication into your existing App.tsx.

## ✅ Files Created

- [x] `src/contexts/AuthContext.tsx` - Authentication context
- [x] `src/components/Login.tsx` - Login UI
- [x] `src/components/AuthenticatedApp.tsx` - Auth wrapper
- [x] `src/components/HouseholdSettings.tsx` - Household management
- [x] `src/lib/api.ts` - Updated API with householdId
- [x] `src/main.tsx` - Wrapped with AuthProvider
- [x] `add-authentication-schema.sql` - Database migration
- [x] `SUPABASE_AUTH_SETUP.md` - Setup instructions

## 🔧 Integration Steps

### 1. Database Setup
- [ ] Go to Supabase Dashboard → SQL Editor
- [ ] Copy contents of `add-authentication-schema.sql`
- [ ] Run the SQL script
- [ ] Verify tables created: `households`, `household_members`
- [ ] Verify triggers created: `on_auth_user_created`

### 2. Google OAuth Setup  
- [ ] Go to Google Cloud Console
- [ ] Create OAuth 2.0 Client ID
- [ ] Add redirect URI: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
- [ ] Copy Client ID and Client Secret
- [ ] Go to Supabase Dashboard → Authentication → Providers → Google
- [ ] Enable Google provider
- [ ] Paste Client ID and Client Secret
- [ ] Save

### 3. Update App.tsx

The current App.tsx needs these changes:

#### A. Add Imports
```typescript
import { useAuth } from './contexts/AuthContext'
import { AuthenticatedApp } from './components/AuthenticatedApp'
import { HouseholdSettings } from './components/HouseholdSettings'
import { LogOut, Users } from 'lucide-react'
```

#### B. Wrap Main Content
```typescript
export default function App() {
  return (
    <AuthenticatedApp>
      <MainApp />
    </AuthenticatedApp>
  )
}

function MainApp() {
  const { householdId, user, signOut, householdName } = useAuth()
  
  // Your existing App content goes here
  // But now with householdId available!
}
```

#### C. Update Every API Call

Find all instances of `FoodChooserAPI` and add `householdId` as first parameter:

**Search for:** `FoodChooserAPI.`

**Examples to update:**
```typescript
// OLD:
const meals = await FoodChooserAPI.getMeals()

// NEW:
const meals = await FoodChooserAPI.getMeals(householdId!)


// OLD:
await FoodChooserAPI.addMeal({ restaurant, dish, ... })

// NEW:
await FoodChooserAPI.addMeal(householdId!, { restaurant, dish, ... })


// OLD:
await FoodChooserAPI.updateMeal(id, updates)

// NEW:
await FoodChooserAPI.updateMeal(householdId!, id, updates)


// OLD:
await FoodChooserAPI.deleteMeal(id)

// NEW:
await FoodChooserAPI.deleteMeal(householdId!, id)
```

#### D. Add User Profile Header

Add this to your app header/navigation:

```typescript
<div className="flex items-center gap-4">
  <div className="text-right">
    <p className="text-sm font-medium">{user?.email}</p>
    <p className="text-xs text-gray-500">{householdName}</p>
  </div>
  <button
    onClick={signOut}
    className="p-2 hover:bg-gray-100 rounded-lg"
    title="Sign out"
  >
    <LogOut className="w-5 h-5" />
  </button>
</div>
```

#### E. Add Household Settings (Optional)

If you have a tab/navigation system, add:

```typescript
// In your tab state:
const [currentTab, setCurrentTab] = useState('meals')

// Add household tab:
<button onClick={() => setCurrentTab('household')}>
  <Users className="w-5 h-5" />
  Household
</button>

// In your content area:
{currentTab === 'household' && <HouseholdSettings />}
```

### 4. Testing Checklist

Local Testing:
- [ ] Run `npm run dev`
- [ ] See login screen
- [ ] Click "Sign in with Google"
- [ ] Successfully authenticate
- [ ] App loads after login
- [ ] Can add new meals
- [ ] Can view meal history
- [ ] Can sign out
- [ ] Sign back in - data persists

Database Verification:
- [ ] Check `auth.users` - your user exists
- [ ] Check `households` - household created
- [ ] Check `household_members` - you're linked to household
- [ ] Check `meals` - meals have `household_id` set

### 5. Vercel Deployment

- [ ] Commit all changes to git
- [ ] Push to GitHub/GitLab/Bitbucket
- [ ] Deploy to Vercel (no env variable changes needed!)
- [ ] Update Google OAuth redirect URIs with production URL
- [ ] Test production authentication
- [ ] Verify all features work in production

## 🎯 Quick Migration Script

Here's a regex find/replace to help update API calls quickly:

### Find:
```
FoodChooserAPI\.(getMeals|getGroceries|getUserPreferences|getCuisineOverrides|getOverridesMap|getDisabledItems)\(\)
```

### Replace:
```
FoodChooserAPI.$1(householdId!)
```

### For methods with parameters, manually update:

| Before | After |
|--------|-------|
| `.addMeal({...})` | `.addMeal(householdId!, {...})` |
| `.updateMeal(id, {...})` | `.updateMeal(householdId!, id, {...})` |
| `.deleteMeal(id)` | `.deleteMeal(householdId!, id)` |
| `.addGrocery({...})` | `.addGrocery(householdId!, {...})` |
| `.updateGrocery(id, {...})` | `.updateGrocery(householdId!, id, {...})` |
| `.deleteGrocery(id)` | `.deleteGrocery(householdId!, id)` |
| `.upsertUserPreferences({...})` | `.upsertUserPreferences(householdId!, {...})` |
| `.upsertCuisineOverride(c, n)` | `.upsertCuisineOverride(householdId!, c, n)` |
| `.setDisabledItem(r, d, b)` | `.setDisabledItem(householdId!, r, d, b)` |

## 🐛 Common Issues & Solutions

### Issue: "householdId is null"
**Cause:** Trying to call API before authentication completes  
**Solution:** Wrap App with `<AuthenticatedApp>` - it handles this

### Issue: "Cannot read property 'email' of null"  
**Cause:** Accessing user before loaded  
**Solution:** `<AuthenticatedApp>` handles this, or use `user?.email`

### Issue: API calls fail with 403/401
**Cause:** RLS policies blocking access  
**Solution:** Verify `add-authentication-schema.sql` was run completely

### Issue: "Household not found after login"
**Cause:** Trigger didn't fire to create household  
**Solution:** Check Supabase logs, or manually create household in SQL

### Issue: Data from demo user not visible
**Cause:** Old data has `user_id = 'demo-user-123'`, not linked to household  
**Solution:** Migration in SQL script handles this, or manually update

### Issue: Can't update App.tsx - too complex
**Solution:** Start fresh with a simple test:
```typescript
export default function App() {
  return (
    <AuthenticatedApp>
      <TestAuth />
    </AuthenticatedApp>
  )
}

function TestAuth() {
  const { user, householdId } = useAuth()
  return (
    <div>
      <h1>Authenticated!</h1>
      <p>User: {user?.email}</p>
      <p>Household: {householdId}</p>
    </div>
  )
}
```

## 📚 Documentation Reference

- `AUTHENTICATION_GUIDE.md` - Full architecture and implementation guide
- `SUPABASE_AUTH_SETUP.md` - Step-by-step Google OAuth setup
- `APP_INTEGRATION_GUIDE.md` - Detailed App.tsx integration patterns
- `add-authentication-schema.sql` - Database migration script

## 🎉 Success Criteria

Your integration is complete when:

✅ Users can sign in with Google  
✅ Household is automatically created  
✅ All CRUD operations work (Create, Read, Update, Delete)  
✅ Data persists across sessions  
✅ Multiple users can't see each other's data  
✅ Sign out works correctly  
✅ Production deployment works  

## 💡 Pro Tips

1. **Start with authentication first** - Get login working before updating API calls
2. **Test incrementally** - Update one API call at a time and test
3. **Use browser DevTools** - Check Network tab for API errors
4. **Check Supabase logs** - Dashboard → Logs for database errors
5. **Keep demo mode** - Consider keeping `demo-user-123` for testing without auth

## ⏭️ Next Steps After Integration

1. **Implement invitation system** - Let users invite others to household
2. **Add activity feed** - "Alice added pizza 5 minutes ago"
3. **User avatars** - Show profile pictures from Google
4. **Email notifications** - Alert on household changes
5. **Multiple households** - Allow users to belong to multiple households
6. **Export data** - Let users download their meal history

---

**Need Help?** All the code examples are in the guides. Follow them step-by-step and you'll have authentication working in under an hour! 🚀

