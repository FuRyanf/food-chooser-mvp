-- Debug: Check if user and household were created successfully

-- 1. Check if you were created in auth.users
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 3;

-- 2. Check if any households were created
SELECT id, name, created_at 
FROM households 
ORDER BY created_at DESC 
LIMIT 5;

-- 3. Check if you're linked to a household
SELECT 
  hm.id,
  hm.user_id,
  hm.household_id,
  hm.role,
  h.name as household_name,
  u.email as user_email
FROM household_members hm
LEFT JOIN households h ON h.id = hm.household_id
LEFT JOIN auth.users u ON u.id = hm.user_id
ORDER BY hm.joined_at DESC
LIMIT 5;

-- 4. Check if the trigger exists and is active
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

