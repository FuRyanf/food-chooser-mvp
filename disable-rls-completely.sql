-- TEMPORARY FIX: Disable RLS completely to get the app working

-- 1. Disable RLS on ALL tables
ALTER TABLE households DISABLE ROW LEVEL SECURITY;
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE cuisine_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE groceries DISABLE ROW LEVEL SECURITY;
ALTER TABLE disabled_items DISABLE ROW LEVEL SECURITY;

-- 2. Verify you have exactly one household
SELECT 
  hm.household_id,
  h.name,
  hm.role
FROM household_members hm
JOIN households h ON h.id = hm.household_id
WHERE hm.user_id = 'f6bc87b8-7116-4427-b1c6-c1dcedbd6828';

-- Should return 1 row

-- 3. If you see more than 1 row, clean up:
-- (Uncomment and run if needed)
/*
DELETE FROM household_members 
WHERE user_id = 'f6bc87b8-7116-4427-b1c6-c1dcedbd6828'
AND id NOT IN (
  SELECT id FROM household_members
  WHERE user_id = 'f6bc87b8-7116-4427-b1c6-c1dcedbd6828'
  ORDER BY joined_at ASC
  LIMIT 1
);
*/

