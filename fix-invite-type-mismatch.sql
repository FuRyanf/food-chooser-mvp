-- Fix type mismatch in get_invite_info function
-- The issue: auth.users.email is varchar, but function returns TEXT
-- Solution: Cast email fields to TEXT

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
    u.email::text,  -- Cast varchar to text
    hi.invite_email::text,  -- Cast varchar to text (if it's varchar)
    hi.status,
    hi.created_at,
    hi.expires_at
  FROM household_invitations hi
  JOIN households h ON h.id = hi.household_id
  LEFT JOIN auth.users u ON u.id = hi.inviter_id
  WHERE hi.invite_token = p_invite_token
  AND hi.status = 'pending'
  AND hi.expires_at > NOW();
END;
$$;

