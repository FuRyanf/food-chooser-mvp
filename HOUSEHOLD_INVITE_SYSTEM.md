# 🏠 Household Invite System - Complete Guide

This document describes the **household management and invitation system** implemented in FuDi, including first-time user onboarding, email invitations, household switching, and data cleanup.

---

## 🎯 Overview

The household invite system allows users to:
- **Create new households** or **join existing ones** via email invitations
- **Send invite links** to friends/family to join their household
- **Leave households** at any time
- **Switch households** when accepting a new invitation
- **Auto-cleanup** empty households and all associated data

### Key Principles

1. **Single Household Constraint**: Each user can only belong to one household at a time
2. **Owner Privileges**: Only household owners can invite new members
3. **Secure Invites**: Time-limited (7 days), one-time use tokens
4. **Data Isolation**: All meals, preferences, and groceries are scoped to households
5. **Clean Exit**: Leaving deletes all data if last member

---

## 🗄️ Database Schema

### New Tables

#### `household_invitations`
```sql
CREATE TABLE household_invitations (
  id UUID PRIMARY KEY,
  household_id UUID REFERENCES households(id),
  inviter_id UUID REFERENCES auth.users(id),
  invite_email TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,  -- Secure random token
  status TEXT DEFAULT 'pending',      -- pending | accepted | expired
  created_at TIMESTAMP,
  expires_at TIMESTAMP,               -- 7 days from creation
  accepted_at TIMESTAMP,
  accepted_by_user_id UUID
);
```

### Updated Constraints

#### `household_members` - Single Household Per User
```sql
ALTER TABLE household_members 
ADD CONSTRAINT unique_user_household UNIQUE (user_id);
```

This enforces that each `user_id` can only appear once in the table.

---

## ⚙️ SQL Functions

### 1. `generate_household_invite()`
Creates a new invitation with a secure token.

```sql
SELECT * FROM generate_household_invite(
  p_household_id := 'uuid-here',
  p_inviter_id := 'user-uuid',
  p_invite_email := 'friend@example.com'
);
```

**Returns:**
- `invite_token` - Secure random string
- `invite_id` - UUID of invitation
- `expires_at` - Expiration timestamp (7 days)

**Security:**
- Verifies inviter is a member of the household
- Generates cryptographically secure random token
- Auto-expires after 7 days

### 2. `get_invite_info()`
Retrieves invitation details for display.

```sql
SELECT * FROM get_invite_info(p_invite_token := 'token-here');
```

**Returns:**
- Household name and ID
- Inviter email
- Invitation status and expiration

**Used by:** `InviteAccept` component to display invite details

### 3. `accept_household_invite()`
Accepts an invitation and adds user to household.

```sql
SELECT * FROM accept_household_invite(
  p_invite_token := 'token-here',
  p_user_id := 'user-uuid'
);
```

**What it does:**
1. Validates invite token (not expired, not already accepted)
2. If user is in another household, removes them (switching)
3. Calls `cleanup_empty_household()` on old household
4. Adds user to new household
5. Marks invite as accepted

**Returns:**
- `success` - Boolean
- `household_id` - UUID of joined household
- `message` - Human-readable result

### 4. `leave_household()`
Removes user from their current household.

```sql
SELECT * FROM leave_household(p_user_id := 'user-uuid');
```

**What it does:**
1. Removes user from `household_members`
2. Calls `cleanup_empty_household()` to check if empty
3. If empty, deletes all household data

**Returns:**
- `success` - Boolean
- `message` - Human-readable result

### 5. `cleanup_empty_household()`
Deletes household if no members remain.

```sql
PERFORM cleanup_empty_household(p_household_id := 'uuid-here');
```

**What it deletes:**
- All `meals` for the household
- All `groceries` for the household
- All `user_preferences` for the household
- All `cuisine_overrides` for the household
- All `disabled_items` for the household
- All pending `household_invitations`
- The `households` record itself

**Trigger:** Automatically called after removing members

### 6. `get_household_invites()`
Lists all invitations for a household.

```sql
SELECT * FROM get_household_invites(p_household_id := 'uuid-here');
```

**Returns:**
- All invitations (pending, accepted, expired)
- Inviter emails
- Created/expiration timestamps
- `is_expired` boolean flag

**Used by:** `HouseholdSettings` component to display invites

---

## 🎨 Frontend Components

### 1. `HouseholdOnboarding` - First-Time User Flow

**When shown:** User has authenticated but has no household

**Options:**
- **Create New Household** - Prompts for household name, creates household, makes user owner
- **Join Existing Household** - Shows instructions for getting invited

**Flow:**
```
User logs in → No household found → HouseholdOnboarding
  ├─> Create New → Enter name → Household created → Main app
  └─> Join Existing → Instructions displayed → Wait for invite link
```

**Component location:** `src/components/HouseholdOnboarding.tsx`

### 2. `InviteAccept` - Invitation Acceptance

**When shown:** User clicks invite link (`/invite/:token`)

**What it does:**
1. Fetches invite details from database
2. Displays household name, inviter, expiration
3. If user is in another household, shows warning about switching
4. On accept, calls `accept_household_invite()` RPC
5. Redirects to main app

**Component location:** `src/components/InviteAccept.tsx`

### 3. `HouseholdSettings` - Management UI

**Features:**
- **Rename household** (any member)
- **Invite members** (owner only) - Enter email, generates link
- **View pending invites** (owner only) - Status, expiration, resend option
- **View members** - Name, role, join date
- **Remove members** (owner only)
- **Leave household** (any member) - With confirmation dialog

**Danger Zone:**
- Leave household button with warning
- If last member, shows data deletion warning
- Confirmation required before leaving

**Component location:** `src/components/HouseholdSettings.tsx`

### 4. `AuthContext` Updates

**New state:**
- `needsOnboarding: boolean` - True if user has no household

**Flow changes:**
- No longer auto-creates household on signup
- Sets `needsOnboarding = true` if no household found
- `refreshHousehold()` can be called after onboarding

**Location:** `src/contexts/AuthContext.tsx`

### 5. `App.tsx` Routing

**Route logic:**
```typescript
// Check URL for invite token
if (window.location.pathname.match(/^\/invite\/(.+)$/)) {
  return <InviteAccept token={...} />
}

// Check if user needs onboarding
if (user && needsOnboarding && !householdId) {
  return <HouseholdOnboarding />
}

// Normal app
return <MainApp />
```

**Location:** `src/App.tsx`

---

## 🔄 User Flows

### Flow 1: First-Time User Creates Household

1. User clicks "Sign in with Google"
2. Google OAuth redirects back
3. `AuthContext` detects no household → `needsOnboarding = true`
4. `App` renders `HouseholdOnboarding`
5. User clicks "Create New Household"
6. User enters household name (e.g., "The Smith Family")
7. Household created, user added as owner
8. `onComplete()` → `refreshHousehold()` → Main app loads

**Database changes:**
- New row in `households`
- New row in `household_members` (role: 'owner')
- New row in `user_preferences` (default budget)

### Flow 2: Inviting a New Member

1. Household owner goes to "Household" tab
2. Enters friend's email in invite form
3. Clicks "Send Invite"
4. Frontend calls `generate_household_invite()` RPC
5. Invite link generated: `https://yourapp.com/invite/abc123xyz`
6. Link copied to clipboard
7. **Owner manually sends link** to friend (via email, text, etc.)

**Database changes:**
- New row in `household_invitations` (status: 'pending', expires in 7 days)

**Note:** Email sending is not yet implemented. Owner must manually share the link.

### Flow 3: Accepting an Invitation (No Current Household)

1. User receives invite link from friend
2. User clicks link → Navigates to `/invite/abc123xyz`
3. If not authenticated, `Login` component shown
4. After auth, `InviteAccept` component renders
5. Displays: "You're invited to join **The Smith Family** by john@example.com"
6. User clicks "Accept & Join Household"
7. Frontend calls `accept_household_invite()` RPC
8. User added to household
9. Redirect to main app → Data loads for new household

**Database changes:**
- New row in `household_members`
- Invitation status → 'accepted'

### Flow 4: Accepting an Invitation (Already in a Household)

1. User clicks invite link while already in "Family A"
2. `InviteAccept` detects `householdId` exists
3. Shows warning: "You're already in a household. Accepting this invitation will remove you from your current household."
4. User clicks "Yes, Switch Households"
5. `accept_household_invite()` RPC:
   - Removes user from "Family A"
   - Checks if "Family A" is now empty → Calls `cleanup_empty_household()`
   - Adds user to "Family B"
6. Redirect to main app → Data loads for new household

**Database changes:**
- Row deleted from `household_members` (old household)
- Possibly: Old household and all data deleted (if last member)
- New row in `household_members` (new household)
- Invitation status → 'accepted'

### Flow 5: Leaving a Household

1. User goes to "Household" tab
2. Scrolls to "Danger Zone"
3. Clicks "Leave Household"
4. If last member, sees warning: "This will permanently delete all household data"
5. Clicks "Yes, Leave Household"
6. Frontend calls `leave_household()` RPC
7. User removed from household
8. If last member, all data deleted
9. Page reloads → User sees onboarding screen

**Database changes:**
- Row deleted from `household_members`
- If last member: Entire household + all related data deleted

---

## 🔐 Security Considerations

### Invite Token Security
- **Random generation**: 32-character base64-encoded tokens
- **One-time use**: Status changes to 'accepted' after use
- **Time-limited**: Expire after 7 days
- **Not in UI**: Household IDs are never exposed to users

### Row Level Security (RLS)
Currently **disabled** for development. In production:
- Users can only see invites for their own household
- Only household members can read their household data
- Only household owners can create invites

### Single Household Constraint
- Enforced at database level via `UNIQUE` constraint
- Prevents users from being in multiple households
- `accept_household_invite()` handles switching automatically

---

## 🧪 Testing Checklist

### Manual Testing Steps

#### Test 1: First-Time User
- [ ] Sign in with Google
- [ ] See onboarding screen
- [ ] Create new household with name
- [ ] Redirected to main app
- [ ] Household name appears in header

#### Test 2: Send Invite
- [ ] Go to Household tab
- [ ] Enter email address
- [ ] Click "Send Invite"
- [ ] Invite link copied to clipboard
- [ ] Invite appears in "Pending Invitations" list

#### Test 3: Accept Invite (New User)
- [ ] Open invite link in incognito window
- [ ] Sign in with different Google account
- [ ] See "You're Invited!" screen
- [ ] Click "Accept & Join Household"
- [ ] Redirected to main app
- [ ] See correct household name in header
- [ ] Can view shared meals/data

#### Test 4: Accept Invite (Existing User - Switching)
- [ ] User already in Household A
- [ ] Clicks invite link for Household B
- [ ] Sees warning about switching
- [ ] Clicks "Yes, Switch Households"
- [ ] Removed from Household A
- [ ] Added to Household B
- [ ] Data changes to Household B's data

#### Test 5: Leave Household (Multiple Members)
- [ ] Go to Household tab
- [ ] Click "Leave Household"
- [ ] Confirm action
- [ ] Redirected to onboarding
- [ ] Original household still exists
- [ ] Other members unaffected

#### Test 6: Leave Household (Last Member)
- [ ] User is only member
- [ ] Click "Leave Household"
- [ ] See warning about data deletion
- [ ] Confirm action
- [ ] Household deleted from database
- [ ] All meals, groceries, preferences deleted
- [ ] Redirected to onboarding

#### Test 7: Expired Invite
- [ ] Generate invite
- [ ] Manually set `expires_at` to past date in database
- [ ] Try to accept invite
- [ ] See "Invite has expired" error

---

## 📝 Setup Instructions

### Step 1: Run Database Migration
```bash
# In Supabase SQL Editor, run:
cat add-household-invites.sql
```

This creates:
- `household_invitations` table
- All RPC functions
- Single household constraint
- Cleanup triggers

### Step 2: Verify Functions Exist
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
  'generate_household_invite',
  'get_invite_info',
  'accept_household_invite',
  'leave_household',
  'cleanup_empty_household',
  'get_household_invites'
);
```

Should return 6 rows.

### Step 3: Test Locally
```bash
npm run dev
```

1. Sign in with Google
2. Create household
3. Go to Household tab
4. Generate invite
5. Open invite link in incognito window
6. Accept invitation

### Step 4: Deploy
```bash
git add .
git commit -m "Add household invite system"
git push origin main
```

Vercel will automatically deploy.

### Step 5: Update OAuth Redirect URIs
If using invite links in production, ensure your OAuth redirect URIs include:
```
https://yourapp.vercel.app
https://yourapp.vercel.app/invite/*
```

---

## 🚀 Future Enhancements

### 1. Email Sending (High Priority)
Currently, invite links are only copied to clipboard. Implement:
- Supabase Edge Function to send emails
- Use service like SendGrid, Postmark, or Resend
- HTML email template with branded invite
- "Click here to join" button

**Implementation:**
```typescript
// Edge function at supabase/functions/send-invite/index.ts
Deno.serve(async (req) => {
  const { invite_email, invite_token, household_name } = await req.json()
  const inviteUrl = `https://yourapp.com/invite/${invite_token}`
  
  // Send email via SendGrid/Resend API
  await sendEmail({
    to: invite_email,
    subject: `You're invited to join ${household_name} on FuDi!`,
    html: `<a href="${inviteUrl}">Click here to join</a>`
  })
})
```

### 2. Invite Management
- **Resend invites** - Generate new token, mark old as expired
- **Revoke invites** - Cancel pending invitations
- **Invite history** - Show accepted invites and who joined

### 3. Role Management
- **Add "admin" role** - Can invite but not owner
- **Transfer ownership** - Change owner to another member
- **Permission system** - Fine-grained access control

### 4. Notifications
- **In-app notifications** - "User X joined your household"
- **Email notifications** - "User Y left your household"
- **Invite reminders** - "Your invite expires in 2 days"

### 5. Data Export Before Leaving
- **Export option** - Download household data as JSON/CSV
- **Transfer data** - Move personal meals to new household
- **Archive mode** - Read-only access to old household data

---

## 🐛 Troubleshooting

### Issue: "Invalid or expired invitation link"
**Causes:**
- Invite token doesn't exist in database
- Invite status is not 'pending'
- Invite `expires_at` is in the past

**Solutions:**
- Generate a new invite
- Check database for correct `invite_token`
- Verify `expires_at` timestamp

### Issue: User stuck on onboarding screen
**Causes:**
- `household_members` row not created
- `needsOnboarding` not updating

**Solutions:**
- Check browser console for errors
- Verify `household_members` table has row for user
- Call `refreshHousehold()` manually

### Issue: Can't leave household
**Causes:**
- RPC function `leave_household()` not found
- User not authenticated

**Solutions:**
- Verify function exists in database
- Check Supabase logs for errors
- Ensure user is signed in

### Issue: Data not cleaning up
**Causes:**
- `cleanup_empty_household()` not executing
- Cascade deletes not configured

**Solutions:**
- Manually call function: `SELECT cleanup_empty_household('uuid-here')`
- Verify foreign key constraints have `ON DELETE CASCADE`
- Check Supabase logs for errors

---

## 📖 API Reference

### Frontend API

#### `useAuth()` Hook
```typescript
const {
  user,               // Current authenticated user
  householdId,        // Current household UUID
  householdName,      // Current household name
  needsOnboarding,    // True if user has no household
  refreshHousehold,   // Re-fetch household data
  signOut             // Sign out user
} = useAuth()
```

#### `HouseholdOnboarding` Component
```typescript
<HouseholdOnboarding
  userId={user.id}
  onComplete={() => {
    // Called after household created
    refreshHousehold()
  }}
/>
```

#### `InviteAccept` Component
```typescript
<InviteAccept
  inviteToken="abc123xyz"
  onAccepted={() => {
    // Called after successful accept
    window.location.href = '/'
  }}
/>
```

### Supabase RPC API

#### Generate Invite
```typescript
const { data, error } = await supabase
  .rpc('generate_household_invite', {
    p_household_id: householdId,
    p_inviter_id: userId,
    p_invite_email: 'friend@example.com'
  })
```

#### Accept Invite
```typescript
const { data, error } = await supabase
  .rpc('accept_household_invite', {
    p_invite_token: token,
    p_user_id: userId
  })
```

#### Leave Household
```typescript
const { data, error } = await supabase
  .rpc('leave_household', {
    p_user_id: userId
  })
```

---

**Implementation Complete! ✨**

All components, database functions, and routing are now implemented. Users can create households, send invites, accept invitations, switch households, and leave with automatic cleanup.

