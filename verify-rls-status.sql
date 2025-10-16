-- Check if RLS is actually disabled

SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('households', 'household_members', 'meals', 'user_preferences', 'cuisine_overrides', 'groceries', 'disabled_items')
ORDER BY tablename;

-- If you see 'true' (rls_enabled), run this to disable:
/*
ALTER TABLE households DISABLE ROW LEVEL SECURITY;
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE cuisine_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE groceries DISABLE ROW LEVEL SECURITY;
ALTER TABLE disabled_items DISABLE ROW LEVEL SECURITY;
*/

