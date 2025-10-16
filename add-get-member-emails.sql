-- ============================================
-- GET MEMBER EMAILS FUNCTION
-- ============================================
-- This function retrieves household members with their email addresses
-- from the auth.users table

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_household_members_with_emails(UUID) TO authenticated;

-- Test the function (replace with your actual household_id)
-- SELECT * FROM get_household_members_with_emails('your-household-id-here');

RAISE NOTICE '✅ get_household_members_with_emails function created!';

