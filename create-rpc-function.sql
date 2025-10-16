-- Create RPC function to bypass RLS and get user's household

CREATE OR REPLACE FUNCTION get_user_household(user_uuid UUID)
RETURNS TABLE (household_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER -- Run with function owner's privileges, bypassing RLS
AS $$
BEGIN
  RETURN QUERY
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = user_uuid
  LIMIT 1;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_household(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_household(UUID) TO anon;

-- Test it
SELECT * FROM get_user_household('f6bc87b8-7116-4427-b1c6-c1dcedbd6828'::UUID);

