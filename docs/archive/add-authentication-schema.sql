-- Migration: Add Google OAuth Authentication with Shared Household Support
-- Description: Enables multiple Google accounts to share one household account
-- Created: 2025-10-15

-- 1. Create households table
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL DEFAULT 'My Household',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create household_members junction table
CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- 3. Add household_id columns to existing tables
ALTER TABLE meals 
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

ALTER TABLE user_preferences 
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

ALTER TABLE cuisine_overrides 
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

ALTER TABLE groceries 
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

ALTER TABLE disabled_items 
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_meals_household ON meals(household_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_household ON user_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_cuisine_overrides_household ON cuisine_overrides(household_id);
CREATE INDEX IF NOT EXISTS idx_groceries_household ON groceries(household_id);
CREATE INDEX IF NOT EXISTS idx_disabled_items_household ON disabled_items(household_id);

-- 5. Enable Row Level Security
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Update RLS on existing tables
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuisine_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE groceries ENABLE ROW LEVEL SECURITY;
ALTER TABLE disabled_items ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies for households table
DROP POLICY IF EXISTS "Users can view their households" ON households;
CREATE POLICY "Users can view their households"
  ON households FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their households" ON households;
CREATE POLICY "Users can update their households"
  ON households FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert households" ON households;
CREATE POLICY "Users can insert households"
  ON households FOR INSERT
  WITH CHECK (true); -- Anyone can create a household

-- 7. Create RLS Policies for household_members table
DROP POLICY IF EXISTS "Users can view household members" ON household_members;
CREATE POLICY "Users can view household members"
  ON household_members FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert household members" ON household_members;
CREATE POLICY "Users can insert household members"
  ON household_members FOR INSERT
  WITH CHECK (
    -- Only if they're an owner of the household
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_id = household_members.household_id
      AND user_id = auth.uid()
      AND role = 'owner'
    )
    OR
    -- Or if this is their first household (joining)
    NOT EXISTS (
      SELECT 1 FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can remove household members" ON household_members;
CREATE POLICY "Owners can remove household members"
  ON household_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_id = household_members.household_id
      AND user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- 8. Update RLS Policies for existing tables to use household_id
-- Meals
DROP POLICY IF EXISTS "Users can view their household meals" ON meals;
CREATE POLICY "Users can view their household meals"
  ON meals FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert meals" ON meals;
CREATE POLICY "Users can insert meals"
  ON meals FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their household meals" ON meals;
CREATE POLICY "Users can update their household meals"
  ON meals FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their household meals" ON meals;
CREATE POLICY "Users can delete their household meals"
  ON meals FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

-- User Preferences
DROP POLICY IF EXISTS "Users can view their household preferences" ON user_preferences;
CREATE POLICY "Users can view their household preferences"
  ON user_preferences FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their household preferences" ON user_preferences;
CREATE POLICY "Users can manage their household preferences"
  ON user_preferences FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

-- Cuisine Overrides
DROP POLICY IF EXISTS "Users can view their household cuisine overrides" ON cuisine_overrides;
CREATE POLICY "Users can view their household cuisine overrides"
  ON cuisine_overrides FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their household cuisine overrides" ON cuisine_overrides;
CREATE POLICY "Users can manage their household cuisine overrides"
  ON cuisine_overrides FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

-- Groceries
DROP POLICY IF EXISTS "Users can view their household groceries" ON groceries;
CREATE POLICY "Users can view their household groceries"
  ON groceries FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their household groceries" ON groceries;
CREATE POLICY "Users can manage their household groceries"
  ON groceries FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

-- Disabled Items
DROP POLICY IF EXISTS "Users can view their household disabled items" ON disabled_items;
CREATE POLICY "Users can view their household disabled items"
  ON disabled_items FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their household disabled items" ON disabled_items;
CREATE POLICY "Users can manage their household disabled items"
  ON disabled_items FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );

-- 9. Create function to automatically create household for new users
CREATE OR REPLACE FUNCTION create_household_for_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- Create a new household
  INSERT INTO households (name)
  VALUES ('My Household')
  RETURNING id INTO new_household_id;

  -- Add the user as the owner
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (new_household_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_household_for_new_user();

-- 11. Migration: Update existing demo data to use households (optional)
-- This creates a household for existing demo data
DO $$
DECLARE
  demo_household_id UUID;
BEGIN
  -- Check if demo data exists
  IF EXISTS (SELECT 1 FROM meals WHERE user_id = 'demo-user-123' LIMIT 1) THEN
    -- Create a demo household
    INSERT INTO households (name)
    VALUES ('Demo Household')
    RETURNING id INTO demo_household_id;

    -- Update existing records
    UPDATE meals SET household_id = demo_household_id WHERE user_id = 'demo-user-123';
    UPDATE user_preferences SET household_id = demo_household_id WHERE user_id = 'demo-user-123';
    UPDATE cuisine_overrides SET household_id = demo_household_id WHERE user_id = 'demo-user-123';
    UPDATE groceries SET household_id = demo_household_id WHERE user_id = 'demo-user-123';
    UPDATE disabled_items SET household_id = demo_household_id WHERE user_id = 'demo-user-123';

    RAISE NOTICE 'Demo data migrated to household %', demo_household_id;
  END IF;
END $$;

-- 12. Comments for documentation
COMMENT ON TABLE households IS 'Represents a shared account (family/household) that multiple users can belong to';
COMMENT ON TABLE household_members IS 'Junction table linking users to households with their role';
COMMENT ON COLUMN household_members.role IS 'User role: owner (can manage members) or member (can only access data)';

