-- FuDi Database Setup - Complete Setup Script
-- Run this ONCE when setting up a new Supabase project
-- This includes: base schema + person tracking + authentication

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
-- PART 2: AUTHENTICATION & HOUSEHOLDS
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
  UNIQUE(household_id, user_id)
);

-- ============================================
-- PART 3: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meals_user ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_household ON meals(household_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_groceries_user ON groceries(user_id);
CREATE INDEX IF NOT EXISTS idx_groceries_household ON groceries(household_id);
CREATE INDEX IF NOT EXISTS idx_groceries_date ON groceries(date);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);

-- ============================================
-- PART 4: RLS (Row Level Security) - DISABLED FOR NOW
-- ============================================
-- Note: RLS is intentionally disabled during initial setup
-- This prevents authentication issues during development

ALTER TABLE households DISABLE ROW LEVEL SECURITY;
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE cuisine_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE groceries DISABLE ROW LEVEL SECURITY;
ALTER TABLE disabled_items DISABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 5: RPC FUNCTION (Bypass RLS issues)
-- ============================================

CREATE OR REPLACE FUNCTION get_user_household(user_uuid UUID)
RETURNS TABLE (household_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = user_uuid
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_household(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_household(UUID) TO anon;

-- ============================================
-- PART 6: AUTO-CREATE HOUSEHOLD ON USER SIGNUP
-- ============================================

CREATE OR REPLACE FUNCTION public.create_household_for_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- Create a new household
  INSERT INTO public.households (name, created_at, updated_at)
  VALUES ('My Household', NOW(), NOW())
  RETURNING id INTO new_household_id;

  -- Add the user as the owner
  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
  VALUES (new_household_id, NEW.id, 'owner', NOW());

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create household for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_household_for_new_user();

-- ============================================
-- VERIFICATION
-- ============================================

-- Check that all tables were created
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('meals', 'groceries', 'user_preferences', 'cuisine_overrides', 'disabled_items', 'households', 'household_members')
ORDER BY tablename;

-- Verify trigger exists
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

RAISE NOTICE '✅ Database setup complete!';

