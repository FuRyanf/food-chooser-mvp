-- ============================================
-- FuDi Complete Database Setup
-- Run this ONCE when setting up a new Supabase project
-- ============================================
-- This script includes:
-- 1. Base tables (meals, groceries, preferences, etc.)
-- 2. Households and members
-- 3. User profiles with display names
-- 4. Household invitations (reusable codes)
-- 5. RLS policies
-- 6. Triggers
-- 7. RPC functions
-- ============================================

-- ============================================
-- PART 1: BASE TABLES
-- ============================================

-- Meals table
CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  household_id UUID,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  restaurant TEXT,
  dish TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  cost NUMERIC(10, 2) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  seed_only BOOLEAN DEFAULT false,
  purchaser_name TEXT DEFAULT 'Unknown',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Groceries table
CREATE TABLE IF NOT EXISTS groceries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  household_id UUID,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  notes TEXT,
  trip_label TEXT,
  purchaser_name TEXT DEFAULT 'Unknown',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL UNIQUE,
  household_id UUID,
  budget_min NUMERIC(10, 2) NOT NULL DEFAULT 10,
  budget_max NUMERIC(10, 2) NOT NULL DEFAULT 35,
  forbid_repeat_days INTEGER NOT NULL DEFAULT 1,
  strict_budget BOOLEAN NOT NULL DEFAULT true,
  monthly_budget NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cuisine overrides table
CREATE TABLE IF NOT EXISTS cuisine_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  household_id UUID,
  cuisine TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, cuisine)
);

-- Disabled items table
CREATE TABLE IF NOT EXISTS disabled_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  household_id UUID,
  restaurant_norm TEXT NOT NULL,
  dish_norm TEXT NOT NULL,
  disabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, restaurant_norm, dish_norm)
);

-- ============================================
-- PART 2: HOUSEHOLDS & MEMBERS
-- ============================================

-- Households table (shared accounts)
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Household',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Household members (links users to households)
CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(household_id, user_id),
  UNIQUE(user_id)  -- Each user can only belong to one household
);

-- ============================================
-- PART 3: USER PROFILES
-- ============================================

-- Profiles table for display names
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PART 4: HOUSEHOLD INVITATIONS (REUSABLE CODES)
-- ============================================

-- Household invitations table
CREATE TABLE IF NOT EXISTS household_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_email TEXT,  -- Optional, for tracking only
  invite_token TEXT NOT NULL,  -- 6-character code (no unique constraint - reusable!)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- PART 5: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meals_user ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_household ON meals(household_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_groceries_user ON groceries(user_id);
CREATE INDEX IF NOT EXISTS idx_groceries_household ON groceries(household_id);
CREATE INDEX IF NOT EXISTS idx_groceries_date ON groceries(date);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_household ON user_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_cuisine_overrides_user ON cuisine_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_disabled_items_user ON disabled_items(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_household_invitations_token ON household_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_household_invitations_household ON household_invitations(household_id);

-- ============================================
-- PART 6: ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables EXCEPT household_members
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE groceries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuisine_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE disabled_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;

-- Disable RLS on household_members to prevent recursion
-- (This table only contains user_id <-> household_id mappings, not sensitive data)
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies first (MUST be before dropping functions)
DROP POLICY IF EXISTS "Users can view meals in their household" ON meals;
DROP POLICY IF EXISTS "Users can insert meals in their household" ON meals;
DROP POLICY IF EXISTS "Users can update meals in their household" ON meals;
DROP POLICY IF EXISTS "Users can delete meals in their household" ON meals;
DROP POLICY IF EXISTS "Users can view groceries in their household" ON groceries;
DROP POLICY IF EXISTS "Users can insert groceries in their household" ON groceries;
DROP POLICY IF EXISTS "Users can update groceries in their household" ON groceries;
DROP POLICY IF EXISTS "Users can delete groceries in their household" ON groceries;
DROP POLICY IF EXISTS "Users can view preferences in their household" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can view overrides in their household" ON cuisine_overrides;
DROP POLICY IF EXISTS "Users can manage overrides in their household" ON cuisine_overrides;
DROP POLICY IF EXISTS "Users can view disabled items in their household" ON disabled_items;
DROP POLICY IF EXISTS "Users can manage disabled items in their household" ON disabled_items;
DROP POLICY IF EXISTS "Users can view their own household" ON households;
DROP POLICY IF EXISTS "Users can update their own household" ON households;
DROP POLICY IF EXISTS "Users can view members of their household" ON household_members;
DROP POLICY IF EXISTS "Users can view all household members" ON household_members;
DROP POLICY IF EXISTS "Users can insert themselves as members" ON household_members;
DROP POLICY IF EXISTS "Owners can manage members" ON household_members;
DROP POLICY IF EXISTS "Owners can update members" ON household_members;
DROP POLICY IF EXISTS "Owners can delete members" ON household_members;
DROP POLICY IF EXISTS "Users can update their own membership" ON household_members;
DROP POLICY IF EXISTS "Users can delete their own membership" ON household_members;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view invitations for their household" ON household_invitations;
DROP POLICY IF EXISTS "Owners can create invitations" ON household_invitations;

-- Now drop helper functions (after policies are dropped)
DROP FUNCTION IF EXISTS get_user_household_id();
DROP FUNCTION IF EXISTS user_is_household_owner(UUID);

-- Helper function to get user's household_id (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper function to check if user is owner of a household (bypasses RLS)
CREATE OR REPLACE FUNCTION user_is_household_owner(p_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE user_id = auth.uid()
    AND household_id = p_household_id
    AND role = 'owner'
  );
$$;

-- RLS Policies for meals
CREATE POLICY "Users can view meals in their household" ON meals
  FOR SELECT USING (household_id = get_user_household_id());

CREATE POLICY "Users can insert meals in their household" ON meals
  FOR INSERT WITH CHECK (household_id = get_user_household_id());

CREATE POLICY "Users can update meals in their household" ON meals
  FOR UPDATE USING (household_id = get_user_household_id());

CREATE POLICY "Users can delete meals in their household" ON meals
  FOR DELETE USING (household_id = get_user_household_id());

-- RLS Policies for groceries (same pattern)
CREATE POLICY "Users can view groceries in their household" ON groceries
  FOR SELECT USING (household_id = get_user_household_id());
CREATE POLICY "Users can insert groceries in their household" ON groceries
  FOR INSERT WITH CHECK (household_id = get_user_household_id());
CREATE POLICY "Users can update groceries in their household" ON groceries
  FOR UPDATE USING (household_id = get_user_household_id());
CREATE POLICY "Users can delete groceries in their household" ON groceries
  FOR DELETE USING (household_id = get_user_household_id());

-- RLS Policies for user_preferences
CREATE POLICY "Users can view preferences in their household" ON user_preferences
  FOR SELECT USING (household_id = get_user_household_id());
CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT WITH CHECK (user_id::uuid = auth.uid());
CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE USING (user_id::uuid = auth.uid());
CREATE POLICY "Users can delete their own preferences" ON user_preferences
  FOR DELETE USING (user_id::uuid = auth.uid());

-- RLS Policies for cuisine_overrides
CREATE POLICY "Users can view overrides in their household" ON cuisine_overrides
  FOR SELECT USING (household_id = get_user_household_id());
CREATE POLICY "Users can manage overrides in their household" ON cuisine_overrides
  FOR ALL USING (household_id = get_user_household_id());

-- RLS Policies for disabled_items
CREATE POLICY "Users can view disabled items in their household" ON disabled_items
  FOR SELECT USING (household_id = get_user_household_id());
CREATE POLICY "Users can manage disabled items in their household" ON disabled_items
  FOR ALL USING (household_id = get_user_household_id());

-- RLS Policies for households
CREATE POLICY "Users can view their own household" ON households
  FOR SELECT USING (id = get_user_household_id());
CREATE POLICY "Users can update their own household" ON households
  FOR UPDATE USING (id = get_user_household_id());

-- No RLS policies for household_members (RLS disabled to prevent recursion)
-- Security note: household_members only contains user_id <-> household_id mappings
-- Actual sensitive data (meals, groceries, etc.) is protected by their own RLS policies

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for household_invitations
CREATE POLICY "Users can view invitations for their household" ON household_invitations
  FOR SELECT USING (household_id = get_user_household_id());
CREATE POLICY "Owners can create invitations" ON household_invitations
  FOR INSERT WITH CHECK (user_is_household_owner(household_id));

-- ============================================
-- PART 7: TRIGGERS
-- ============================================

-- Trigger to auto-create household when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- Create a new household for the user
  INSERT INTO public.households (name, created_at, updated_at)
  VALUES ('My Household', NOW(), NOW())
  RETURNING id INTO new_household_id;

  -- Add user as the owner of the household
  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
  VALUES (new_household_id, NEW.id, 'owner', NOW());

  RETURN NEW;
END;
$$;

-- Trigger to auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create a profile for the new user with a default name from their email
  INSERT INTO public.profiles (id, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)  -- Use email prefix as default
    ),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;

-- Create triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- ============================================
-- PART 8: RPC FUNCTIONS
-- ============================================

-- Drop all existing RPC functions first (for idempotency)
DROP FUNCTION IF EXISTS get_user_household(UUID);
DROP FUNCTION IF EXISTS get_household_members_with_emails(UUID);
DROP FUNCTION IF EXISTS generate_household_invite(UUID);
DROP FUNCTION IF EXISTS accept_household_invite(TEXT);
DROP FUNCTION IF EXISTS get_invite_info(TEXT);
DROP FUNCTION IF EXISTS get_household_invites(UUID);
DROP FUNCTION IF EXISTS leave_household();

-- Function to get user's household
CREATE OR REPLACE FUNCTION get_user_household(p_user_id UUID)
RETURNS TABLE (household_id UUID, household_name TEXT, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT hm.household_id, h.name, hm.role
  FROM household_members hm
  JOIN households h ON h.id = hm.household_id
  WHERE hm.user_id = p_user_id
  LIMIT 1;
END;
$$;

-- Function to get household members with emails
CREATE OR REPLACE FUNCTION get_household_members_with_emails(p_household_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    hm.id,
    hm.user_id,
    hm.role,
    hm.joined_at,
    COALESCE(u.email::text, 'No email') as email
  FROM household_members hm
  LEFT JOIN auth.users u ON u.id = hm.user_id
  WHERE hm.household_id = p_household_id
  ORDER BY hm.joined_at ASC;
END;
$$;

-- Function to generate household invite (reusable code)
CREATE OR REPLACE FUNCTION generate_household_invite(p_household_id UUID)
RETURNS TABLE (
  invite_code TEXT,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_token TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_invite_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user is owner of the household
  IF NOT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = p_household_id
    AND user_id = v_user_id
    AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only household owners can generate invite codes';
  END IF;

  -- Check if there's already an active invite for this household
  SELECT hi.invite_token, hi.expires_at, hi.id
  INTO v_invite_token, v_expires_at, v_invite_id
  FROM household_invitations hi
  WHERE hi.household_id = p_household_id
  AND hi.status = 'pending'
  AND hi.expires_at > NOW()
  LIMIT 1;

  -- If no active invite exists, create a new one
  IF v_invite_token IS NULL THEN
    -- Generate a simple 6-character code
    v_invite_token := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    v_expires_at := NOW() + INTERVAL '7 days';
    
    INSERT INTO household_invitations (
      household_id,
      inviter_id,
      invite_email,
      invite_token,
      status,
      created_at,
      expires_at
    ) VALUES (
      p_household_id,
      v_user_id,
      NULL,
      v_invite_token,
      'pending',
      NOW(),
      v_expires_at
    )
    RETURNING id INTO v_invite_id;
  END IF;

  -- Return with explicit column names
  RETURN QUERY SELECT v_invite_token AS invite_code, v_expires_at AS expires_at;
END;
$$;

-- Function to accept household invite (reusable, auto-leaves current household)
CREATE OR REPLACE FUNCTION accept_household_invite(p_invite_code TEXT)
RETURNS TABLE (
  success BOOLEAN,
  household_id UUID,
  household_name TEXT,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_household_id UUID;
  v_household_name TEXT;
  v_existing_household_id UUID;
  v_invite_id UUID;
  v_remaining_members INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  -- Find the invite by code (handles both old 36-char and new 6-char formats)
  SELECT hi.id, hi.household_id, h.name
  INTO v_invite_id, v_household_id, v_household_name
  FROM household_invitations hi
  JOIN households h ON h.id = hi.household_id
  WHERE (
    -- Match exact token (for old 36-char format)
    UPPER(TRIM(hi.invite_token)) = UPPER(TRIM(p_invite_code))
    OR
    -- Match last 6 characters (for new 6-char format and flexibility)
    UPPER(RIGHT(TRIM(hi.invite_token), 6)) = UPPER(RIGHT(TRIM(p_invite_code), 6))
  )
  AND hi.status = 'pending'
  AND hi.expires_at > NOW()
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Invalid or expired invite code'::TEXT;
    RETURN;
  END IF;

  -- Check if user is already in a household
  SELECT hm.household_id INTO v_existing_household_id
  FROM household_members hm
  WHERE hm.user_id = v_user_id
  LIMIT 1;

  -- If user is already in the same household, return success
  IF v_existing_household_id = v_household_id THEN
    RETURN QUERY SELECT TRUE, v_household_id, v_household_name, 'Already a member'::TEXT;
    RETURN;
  END IF;

  -- If user is in a different household, auto-leave it
  IF v_existing_household_id IS NOT NULL THEN
    -- Remove user from old household
    DELETE FROM household_members hm
    WHERE hm.user_id = v_user_id;
    
    -- Check if old household is now empty
    SELECT COUNT(*) INTO v_remaining_members
    FROM household_members hm
    WHERE hm.household_id = v_existing_household_id;
    
    -- If empty, clean up the old household
    IF v_remaining_members = 0 THEN
      DELETE FROM household_invitations hi WHERE hi.household_id = v_existing_household_id;
      DELETE FROM meals m WHERE m.household_id = v_existing_household_id;
      DELETE FROM groceries g WHERE g.household_id = v_existing_household_id;
      DELETE FROM user_preferences up WHERE up.household_id = v_existing_household_id;
      DELETE FROM cuisine_overrides co WHERE co.household_id = v_existing_household_id;
      DELETE FROM disabled_items di WHERE di.household_id = v_existing_household_id;
      DELETE FROM households h WHERE h.id = v_existing_household_id;
    END IF;
  END IF;

  -- Add user to the new household
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household_id, v_user_id, 'member')
  ON CONFLICT (user_id) DO UPDATE SET household_id = EXCLUDED.household_id;

  -- Note: invite remains 'pending' for reuse
  
  RETURN QUERY SELECT TRUE, v_household_id, v_household_name, 'Successfully joined household'::TEXT;
END;
$$;

-- Function to get invite info (handles both old 36-char and new 6-char codes)
CREATE OR REPLACE FUNCTION get_invite_info(p_invite_code TEXT)
RETURNS TABLE (
  invite_id UUID,
  household_id UUID,
  household_name TEXT,
  inviter_email TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    hi.id,
    hi.household_id,
    h.name,
    u.email::text,
    hi.status,
    hi.created_at,
    hi.expires_at
  FROM household_invitations hi
  JOIN households h ON h.id = hi.household_id
  LEFT JOIN auth.users u ON u.id = hi.inviter_id
  WHERE (
    -- Match exact token (for old 36-char format)
    UPPER(TRIM(hi.invite_token)) = UPPER(TRIM(p_invite_code))
    OR
    -- Match last 6 characters (for new 6-char format and flexibility)
    UPPER(RIGHT(TRIM(hi.invite_token), 6)) = UPPER(RIGHT(TRIM(p_invite_code), 6))
  )
  AND hi.status = 'pending'
  AND hi.expires_at > NOW()
  LIMIT 1;
END;
$$;

-- Function to get household invites
CREATE OR REPLACE FUNCTION get_household_invites(p_household_id UUID)
RETURNS TABLE (
  invite_id UUID,
  invite_email TEXT,
  invite_token TEXT,
  inviter_email TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    hi.id AS invite_id,
    hi.invite_email AS invite_email,
    hi.invite_token AS invite_token,
    u.email::text AS inviter_email,
    hi.status AS status,
    hi.created_at AS created_at,
    hi.expires_at AS expires_at,
    (hi.expires_at < NOW()) AS is_expired
  FROM household_invitations hi
  LEFT JOIN auth.users u ON u.id = hi.inviter_id
  WHERE hi.household_id = p_household_id
  ORDER BY hi.created_at DESC;
END;
$$;

-- Function to leave household
CREATE OR REPLACE FUNCTION leave_household()
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_household_id UUID;
  v_remaining_members INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  -- Get user's household
  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not in a household'::TEXT;
    RETURN;
  END IF;

  -- Remove user from household
  DELETE FROM household_members
  WHERE user_id = v_user_id;

  -- Check if household is now empty
  SELECT COUNT(*) INTO v_remaining_members
  FROM household_members
  WHERE household_id = v_household_id;

  -- If empty, delete the household and all associated data
  IF v_remaining_members = 0 THEN
    DELETE FROM household_invitations WHERE household_id = v_household_id;
    DELETE FROM meals WHERE household_id = v_household_id;
    DELETE FROM groceries WHERE household_id = v_household_id;
    DELETE FROM user_preferences WHERE household_id = v_household_id;
    DELETE FROM cuisine_overrides WHERE household_id = v_household_id;
    DELETE FROM disabled_items WHERE household_id = v_household_id;
    DELETE FROM households WHERE id = v_household_id;
    
    RETURN QUERY SELECT TRUE, 'Left household and cleaned up empty household'::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, 'Successfully left household'::TEXT;
  END IF;
END;
$$;

-- ============================================
-- PART 9: GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON meals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON groceries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cuisine_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON disabled_items TO authenticated;
GRANT SELECT, UPDATE ON households TO authenticated;
GRANT SELECT, INSERT, DELETE ON household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON household_invitations TO authenticated;

-- ============================================
-- SETUP COMPLETE!
-- ============================================

SELECT '✅ FuDi database setup complete!' as status;
SELECT 'Tables, RLS policies, triggers, and functions are ready.' as info;

