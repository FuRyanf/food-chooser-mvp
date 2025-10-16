-- ============================================
-- Simplify Household Invites to Reusable Codes
-- ============================================

-- Update the household_invitations table to support reusable codes
-- Drop the unique constraint on invite_token (allow reuse)
ALTER TABLE household_invitations 
DROP CONSTRAINT IF EXISTS household_invitations_invite_token_key;

-- Make invite_email nullable (not required)
ALTER TABLE household_invitations 
ALTER COLUMN invite_email DROP NOT NULL;

-- Update the generate_household_invite function to be simpler
CREATE OR REPLACE FUNCTION generate_household_invite(
  p_household_id UUID
)
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
  -- Get current user
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
  SELECT invite_token, expires_at, id
  INTO v_invite_token, v_expires_at, v_invite_id
  FROM household_invitations
  WHERE household_id = p_household_id
  AND status = 'pending'
  AND expires_at > NOW()
  LIMIT 1;

  -- If no active invite exists, create a new one
  IF v_invite_token IS NULL THEN
    -- Generate a simple 6-character code (uppercase letters and numbers)
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
      NULL,  -- No email required
      v_invite_token,
      'pending',
      NOW(),
      v_expires_at
    )
    RETURNING id INTO v_invite_id;
  END IF;

  -- Return the code (reusable)
  RETURN QUERY
  SELECT v_invite_token, v_expires_at;
END;
$$;

-- Update accept_household_invite to support multi-use codes
CREATE OR REPLACE FUNCTION accept_household_invite(
  p_invite_code TEXT
)
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
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  -- Find the invite by code (case-insensitive)
  SELECT hi.id, hi.household_id, h.name
  INTO v_invite_id, v_household_id, v_household_name
  FROM household_invitations hi
  JOIN households h ON h.id = hi.household_id
  WHERE UPPER(hi.invite_token) = UPPER(p_invite_code)
  AND hi.status = 'pending'
  AND hi.expires_at > NOW()
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Invalid or expired invite code'::TEXT;
    RETURN;
  END IF;

  -- Check if user is already in a household
  SELECT household_id INTO v_existing_household_id
  FROM household_members
  WHERE user_id = v_user_id
  LIMIT 1;

  -- If user is already in the same household, return success
  IF v_existing_household_id = v_household_id THEN
    RETURN QUERY SELECT TRUE, v_household_id, v_household_name, 'Already a member'::TEXT;
    RETURN;
  END IF;

  -- If user is in a different household, they need to leave first
  IF v_existing_household_id IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Must leave current household first'::TEXT;
    RETURN;
  END IF;

  -- Add user to the household
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household_id, v_user_id, 'member')
  ON CONFLICT (user_id) DO NOTHING;

  -- Note: We do NOT update the invite status - it remains 'pending' and reusable
  
  RETURN QUERY SELECT TRUE, v_household_id, v_household_name, 'Successfully joined household'::TEXT;
END;
$$;

-- Update get_invite_info to work with codes
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
  WHERE UPPER(hi.invite_token) = UPPER(p_invite_code)
  AND hi.status = 'pending'
  AND hi.expires_at > NOW();
END;
$$;

-- Show success message
SELECT '✅ Invite system simplified!' as status;
SELECT 'Codes are now reusable and expire after 7 days' as info;

