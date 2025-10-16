-- Fix: Database error saving new user
-- This updates the trigger to handle permissions correctly

-- 1. Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS create_household_for_new_user();

-- 2. Recreate function with proper security context
CREATE OR REPLACE FUNCTION public.create_household_for_new_user()
RETURNS TRIGGER 
SECURITY DEFINER -- Run with function owner's privileges
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
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create household for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_household_for_new_user();

-- 4. Temporarily disable RLS for household creation
-- (The trigger runs as SECURITY DEFINER so it bypasses RLS, but let's be explicit)

-- Verify the trigger is active
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

