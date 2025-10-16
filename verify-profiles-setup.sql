-- ============================================
-- Verify User Profiles Setup
-- Run this to check if everything is configured correctly
-- ============================================

-- Check if profiles table exists
SELECT 'profiles table exists' as status, count(*) as profile_count 
FROM profiles;

-- Check if RLS is enabled
SELECT 
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- Check existing policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_name = 'on_auth_user_created_profile';

-- Check if your profile exists
SELECT 
  id,
  display_name,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- If you see results, everything is already set up! ✅

