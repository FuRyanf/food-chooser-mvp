-- ============================================
-- HOUSEHOLD INVITE SYSTEM
-- ============================================
-- This script adds:
-- 1. Invitations table
-- 2. Single household constraint
-- 3. Invite generation and acceptance functions
-- 4. Leave household functionality
-- 5. Auto-cleanup empty households

-- ============================================
-- PART 1: INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS household_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_email TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invitations_token ON household_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON household_invitations(invite_email);
CREATE INDEX IF NOT EXISTS idx_invitations_household ON household_invitations(household_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON household_invitations(status);

-- ============================================
-- PART 2: ENFORCE SINGLE HOUSEHOLD CONSTRAINT
-- ============================================

-- Drop existing constraint if it exists
ALTER TABLE household_members DROP CONSTRAINT IF EXISTS unique_user_household;

-- Add unique constraint on user_id (one household per user)
ALTER TABLE household_members ADD CONSTRAINT unique_user_household UNIQUE (user_id);

-- ============================================
-- PART 3: GENERATE INVITE TOKEN FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION generate_household_invite(
  p_household_id UUID,
  p_inviter_id UUID,
  p_invite_email TEXT
)
RETURNS TABLE (
  invite_token TEXT,
  invite_id UUID,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_token TEXT;
  v_invite_id UUID;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_is_member BOOLEAN;
BEGIN
  -- Verify inviter is a member of the household
  SELECT EXISTS(
    SELECT 1 FROM household_members 
    WHERE household_id = p_household_id 
    AND user_id = p_inviter_id
  ) INTO v_is_member;
  
  IF NOT v_is_member THEN
    RAISE EXCEPTION 'User is not a member of this household';
  END IF;
  
  -- Generate secure random token (32 characters)
  v_invite_token := encode(gen_random_bytes(24), 'base64');
  v_invite_token := replace(v_invite_token, '/', '_');
  v_invite_token := replace(v_invite_token, '+', '-');
  v_invite_token := substring(v_invite_token, 1, 32);
  
  -- Set expiration (7 days from now)
  v_expires_at := NOW() + INTERVAL '7 days';
  
  -- Create invitation
  INSERT INTO household_invitations (
    household_id,
    inviter_id,
    invite_email,
    invite_token,
    expires_at
  )
  VALUES (
    p_household_id,
    p_inviter_id,
    p_invite_email,
    v_invite_token,
    v_expires_at
  )
  RETURNING id INTO v_invite_id;
  
  -- Return invite details
  RETURN QUERY SELECT v_invite_token, v_invite_id, v_expires_at;
END;
$$;

-- ============================================
-- PART 4: GET INVITE INFO FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION get_invite_info(p_invite_token TEXT)
RETURNS TABLE (
  invite_id UUID,
  household_id UUID,
  household_name TEXT,
  inviter_email TEXT,
  invite_email TEXT,
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
    u.email,
    hi.invite_email,
    hi.status,
    hi.created_at,
    hi.expires_at
  FROM household_invitations hi
  JOIN households h ON h.id = hi.household_id
  JOIN auth.users u ON u.id = hi.inviter_id
  WHERE hi.invite_token = p_invite_token
  AND hi.status = 'pending'
  AND hi.expires_at > NOW();
END;
$$;

-- ============================================
-- PART 5: ACCEPT INVITE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION accept_household_invite(
  p_invite_token TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  household_id UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_id UUID;
  v_household_id UUID;
  v_invite_status TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_old_household_id UUID;
BEGIN
  -- Get invite details
  SELECT id, household_invitations.household_id, status, expires_at
  INTO v_invite_id, v_household_id, v_invite_status, v_expires_at
  FROM household_invitations
  WHERE invite_token = p_invite_token;
  
  -- Check if invite exists
  IF v_invite_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invalid invite token';
    RETURN;
  END IF;
  
  -- Check if already accepted
  IF v_invite_status = 'accepted' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invite already accepted';
    RETURN;
  END IF;
  
  -- Check if expired
  IF v_expires_at < NOW() THEN
    UPDATE household_invitations SET status = 'expired' WHERE id = v_invite_id;
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Invite has expired';
    RETURN;
  END IF;
  
  -- Check if user is already in a household
  SELECT household_members.household_id INTO v_old_household_id
  FROM household_members
  WHERE user_id = p_user_id;
  
  -- If in a household, remove them (switching households)
  IF v_old_household_id IS NOT NULL THEN
    DELETE FROM household_members WHERE user_id = p_user_id;
    
    -- Check if old household is now empty and cleanup
    PERFORM cleanup_empty_household(v_old_household_id);
  END IF;
  
  -- Add user to new household
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household_id, p_user_id, 'member')
  ON CONFLICT (user_id) DO UPDATE SET household_id = v_household_id;
  
  -- Mark invite as accepted
  UPDATE household_invitations
  SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = p_user_id
  WHERE id = v_invite_id;
  
  RETURN QUERY SELECT TRUE, v_household_id, 'Successfully joined household';
END;
$$;

-- ============================================
-- PART 6: LEAVE HOUSEHOLD FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION leave_household(p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_household_id UUID;
BEGIN
  -- Get user's current household
  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = p_user_id;
  
  IF v_household_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not a member of any household';
    RETURN;
  END IF;
  
  -- Remove user from household
  DELETE FROM household_members WHERE user_id = p_user_id;
  
  -- Cleanup if household is now empty
  PERFORM cleanup_empty_household(v_household_id);
  
  RETURN QUERY SELECT TRUE, 'Successfully left household';
END;
$$;

-- ============================================
-- PART 7: CLEANUP EMPTY HOUSEHOLD FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_empty_household(p_household_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_count INTEGER;
BEGIN
  -- Count remaining members
  SELECT COUNT(*) INTO v_member_count
  FROM household_members
  WHERE household_id = p_household_id;
  
  -- If no members, delete all household data
  IF v_member_count = 0 THEN
    -- Delete all household data (cascades will handle related records)
    DELETE FROM meals WHERE household_id = p_household_id;
    DELETE FROM groceries WHERE household_id = p_household_id;
    DELETE FROM user_preferences WHERE household_id = p_household_id;
    DELETE FROM cuisine_overrides WHERE household_id = p_household_id;
    DELETE FROM disabled_items WHERE household_id = p_household_id;
    
    -- Delete pending invitations
    DELETE FROM household_invitations WHERE household_id = p_household_id;
    
    -- Finally, delete the household itself
    DELETE FROM households WHERE id = p_household_id;
    
    RAISE NOTICE 'Cleaned up empty household: %', p_household_id;
  END IF;
END;
$$;

-- ============================================
-- PART 8: GET USER'S PENDING INVITES
-- ============================================

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
    hi.id,
    hi.invite_email,
    hi.invite_token,
    u.email,
    hi.status,
    hi.created_at,
    hi.expires_at,
    (hi.expires_at < NOW()) AS is_expired
  FROM household_invitations hi
  JOIN auth.users u ON u.id = hi.inviter_id
  WHERE hi.household_id = p_household_id
  ORDER BY hi.created_at DESC;
END;
$$;

-- ============================================
-- PART 9: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION generate_household_invite(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_info(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION accept_household_invite(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_household(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_household_invites(UUID) TO authenticated;

-- ============================================
-- PART 10: UPDATE AUTO-CREATE HOUSEHOLD TRIGGER
-- ============================================

-- Drop old trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.create_household_for_new_user();

-- New function that does NOT auto-create household
-- (Users will choose to create or join on first login)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Just log the new user, don't create household yet
  RAISE NOTICE 'New user created: %', NEW.id;
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PART 11: DISABLE RLS (for development)
-- ============================================

ALTER TABLE household_invitations DISABLE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICATION
-- ============================================

-- List all new functions
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
)
ORDER BY routine_name;

RAISE NOTICE '✅ Household invite system installed!';

