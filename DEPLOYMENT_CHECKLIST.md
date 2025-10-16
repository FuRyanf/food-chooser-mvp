# 🚀 Deployment Checklist - Household Invite System

Use this checklist to deploy the new household invite system to production.

---

## ✅ Pre-Deployment Checklist

### 1. Review Changes
- [ ] Review all modified files
- [ ] Read `HOUSEHOLD_INVITE_SYSTEM.md` for system overview
- [ ] Read `IMPLEMENTATION_SUMMARY.md` for what's been implemented

### 2. Local Testing
- [ ] Run `npm run dev` - App starts successfully
- [ ] Sign in with Google - Redirects properly
- [ ] See onboarding screen - Create new household works
- [ ] Generate invite link - Copied to clipboard
- [ ] Open invite link in incognito - Shows invite details
- [ ] Accept invitation - Joins household successfully
- [ ] View Household Settings - All sections visible
- [ ] Leave household - Returns to onboarding

### 3. Build Verification
- [x] TypeScript compiles: `npx tsc --noEmit` ✅
- [x] Build succeeds: `npm run build` ✅
- [ ] No console errors in development
- [ ] No console errors in production build preview: `npm run preview`

---

## 🗄️ Database Migration

### Step 1: Backup Current Data (IMPORTANT!)
```sql
-- In Supabase SQL Editor
-- Backup current households
CREATE TABLE households_backup AS SELECT * FROM households;
CREATE TABLE household_members_backup AS SELECT * FROM household_members;
```

### Step 2: Run Migration Script
```sql
-- In Supabase SQL Editor:
-- 1. Copy entire contents of add-household-invites.sql
-- 2. Paste into SQL Editor
-- 3. Click "Run"
-- 4. Should see: "✅ Household invite system installed!"
```

### Step 3: Verify Migration
```sql
-- Check that new table exists
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'household_invitations';
-- Should return 1 row

-- Check that all functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
  'generate_household_invite',
  'get_invite_info',
  'accept_household_invite',
  'leave_household',
  'cleanup_empty_household',
  'get_household_invites'
);
-- Should return 6 rows

-- Check single household constraint
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'household_members'
AND constraint_name = 'unique_user_household';
-- Should return 1 row
```

### Step 4: Test RPC Functions
```sql
-- Test invite generation (replace with your actual UUIDs)
SELECT * FROM generate_household_invite(
  p_household_id := 'your-household-id',
  p_inviter_id := 'your-user-id',
  p_invite_email := 'test@example.com'
);
-- Should return invite_token, invite_id, expires_at

-- Test get invites
SELECT * FROM get_household_invites(p_household_id := 'your-household-id');
-- Should return your test invite
```

---

## 📝 Code Deployment

### Step 1: Commit Changes
```bash
# Review what's changed
git status

# Add all new files
git add add-household-invites.sql
git add HOUSEHOLD_INVITE_SYSTEM.md
git add IMPLEMENTATION_SUMMARY.md
git add DEPLOYMENT_CHECKLIST.md
git add src/components/HouseholdOnboarding.tsx
git add src/components/InviteAccept.tsx

# Add modified files
git add README.md
git add src/App.tsx
git add src/components/HouseholdSettings.tsx
git add src/contexts/AuthContext.tsx

# Commit
git commit -m "feat: Add household invite system with email invitations

- Add email invitation system with secure tokens
- Implement first-time user onboarding
- Add household switching with confirmations
- Add leave household with automatic cleanup
- Add comprehensive documentation
- Enforce single household per user constraint

Resolves: Household management and invitation system"

# Push to main
git push origin main
```

### Step 2: Verify Vercel Deployment
1. Go to [vercel.com](https://vercel.com) dashboard
2. Wait for automatic deployment to complete (~2-3 minutes)
3. Check deployment logs for any errors
4. Visit production URL

### Step 3: Test Production
- [ ] Production site loads
- [ ] Sign in with Google works
- [ ] Onboarding screen appears for new users
- [ ] Can create household
- [ ] Can generate invite link
- [ ] Invite link works: `https://your-app.vercel.app/invite/token`
- [ ] Can accept invitation
- [ ] Can switch households
- [ ] Can leave household

---

## 🧪 Post-Deployment Testing

### Test Scenario 1: New User Journey
1. Open site in incognito
2. Click "Sign in with Google"
3. Select account
4. Should see onboarding screen
5. Click "Create New Household"
6. Enter "Test Family"
7. Should redirect to main app
8. Should see "Test Family" in header

**Expected:** ✅ Smooth flow, no errors

### Test Scenario 2: Generate and Accept Invite
1. Sign in as User A
2. Go to Household tab
3. Enter email: `test@example.com`
4. Click "Send Invite"
5. Copy link from clipboard
6. Open link in incognito (or different browser)
7. Sign in as User B
8. Should see "You're Invited!"
9. Click "Accept & Join Household"
10. Should join User A's household

**Expected:** ✅ User B joins User A's household, sees shared data

### Test Scenario 3: Household Switching
1. User B is in Household A
2. User C sends User B an invite to Household C
3. User B clicks invite link
4. Should see warning: "You're already in a household"
5. Click "Yes, Switch Households"
6. User B should be in Household C
7. Household A should still exist (if other members present)

**Expected:** ✅ User B switches households, data changes

### Test Scenario 4: Leave as Last Member
1. Create household with only one member
2. Go to Household tab
3. Click "Leave Household"
4. Should see warning about data deletion
5. Confirm
6. Should return to onboarding
7. Check database - household should be deleted

**Expected:** ✅ Household and all data deleted, user returns to onboarding

### Test Scenario 5: Expired Invite
1. Generate invite
2. In database, set `expires_at` to past date:
   ```sql
   UPDATE household_invitations 
   SET expires_at = NOW() - INTERVAL '1 day'
   WHERE invite_token = 'your-token';
   ```
3. Try to accept invite
4. Should see "Invalid or expired invitation link"

**Expected:** ✅ Error message shown, cannot accept

---

## 🐛 Rollback Plan (If Needed)

If something goes wrong:

### 1. Rollback Code
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or rollback in Vercel UI:
# Go to Deployments → Previous deployment → Promote to Production
```

### 2. Rollback Database (If Needed)
```sql
-- Drop new objects
DROP TABLE IF EXISTS household_invitations CASCADE;
DROP FUNCTION IF EXISTS generate_household_invite CASCADE;
DROP FUNCTION IF EXISTS get_invite_info CASCADE;
DROP FUNCTION IF EXISTS accept_household_invite CASCADE;
DROP FUNCTION IF EXISTS leave_household CASCADE;
DROP FUNCTION IF EXISTS cleanup_empty_household CASCADE;
DROP FUNCTION IF EXISTS get_household_invites CASCADE;

-- Remove constraint
ALTER TABLE household_members DROP CONSTRAINT IF EXISTS unique_user_household;

-- Restore from backup (if created)
-- TRUNCATE households;
-- INSERT INTO households SELECT * FROM households_backup;
-- TRUNCATE household_members;
-- INSERT INTO household_members SELECT * FROM household_members_backup;
```

---

## 📊 Monitoring

### Things to Monitor Post-Deployment

1. **Error Rates**
   - Check Vercel logs for 500 errors
   - Check Supabase logs for failed queries

2. **User Behavior**
   - How many users create households?
   - How many accept invitations?
   - How many switch households?

3. **Database Performance**
   - RPC function execution times
   - Query performance for large households

4. **Edge Cases**
   - Expired invite attempts
   - Invalid token attempts
   - Concurrent household operations

---

## 🎓 User Communication

### Announce New Feature

**Email/Notification Template:**

> 🎉 **New Feature: Household Invitations!**
> 
> We've added a new way to invite people to your FuDi household:
> 
> - **Easy invites** - Just enter an email address
> - **Secure links** - Time-limited invitation links
> - **Seamless switching** - Move between households with one click
> 
> To invite someone:
> 1. Go to the Household tab
> 2. Enter their email
> 3. Share the generated link
> 
> Questions? Check out our help docs or contact support.

---

## 📚 Documentation Updates

Post-deployment, update these if needed:

- [ ] Update main README with production examples
- [ ] Add screenshots to HOUSEHOLD_INVITE_SYSTEM.md
- [ ] Create video tutorial (optional)
- [ ] Update SETUP_GUIDE.md with lessons learned
- [ ] Add FAQ based on user questions

---

## ✅ Final Checklist

Before marking as complete:

- [ ] Database migration ran successfully
- [ ] All 6 RPC functions exist
- [ ] Code deployed to production
- [ ] Production site tested end-to-end
- [ ] No console errors
- [ ] No Supabase errors
- [ ] Invite flow works
- [ ] Switching flow works
- [ ] Leave flow works
- [ ] Cleanup flow works
- [ ] Documentation reviewed
- [ ] Team/users notified (if applicable)

---

## 🎉 Success Criteria

You'll know deployment is successful when:

✅ New users see onboarding screen  
✅ Users can create households  
✅ Users can send invites  
✅ Invite links work properly  
✅ Switching shows confirmation  
✅ Leaving works with cleanup  
✅ No errors in logs  
✅ All tests pass  

---

## 📞 Support

If you encounter issues during deployment:

1. **Check Supabase Logs**
   - Dashboard → Logs → Postgres Logs
   - Look for failed queries or permission errors

2. **Check Vercel Logs**
   - Deployments → Click deployment → Function Logs
   - Look for runtime errors

3. **Test Locally**
   - Run `npm run dev`
   - Open browser console
   - Replicate the issue

4. **Review Documentation**
   - `HOUSEHOLD_INVITE_SYSTEM.md` - Technical details
   - `IMPLEMENTATION_SUMMARY.md` - What was built
   - `README.md` - User-facing docs

---

**Good luck with your deployment! 🚀**

Remember: You can always rollback if needed. Test thoroughly in development first!

