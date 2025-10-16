-- Find what user_ids actually exist in your tables

-- 1. Check meals
SELECT 'meals' as table_name, user_id, household_id, COUNT(*) as count
FROM meals
GROUP BY user_id, household_id
ORDER BY count DESC;

-- 2. Check groceries
SELECT 'groceries' as table_name, user_id, household_id, COUNT(*) as count
FROM groceries
GROUP BY user_id, household_id
ORDER BY count DESC;

-- 3. Check user_preferences
SELECT 'user_preferences' as table_name, user_id, household_id, COUNT(*) as count
FROM user_preferences
GROUP BY user_id, household_id;

-- 4. Check cuisine_overrides
SELECT 'cuisine_overrides' as table_name, user_id, household_id, COUNT(*) as count
FROM cuisine_overrides
GROUP BY user_id, household_id
ORDER BY count DESC;

-- 5. Check disabled_items
SELECT 'disabled_items' as table_name, user_id, household_id, COUNT(*) as count
FROM disabled_items
GROUP BY user_id, household_id
ORDER BY count DESC;

-- 6. See all distinct user_ids across all tables
SELECT DISTINCT user_id, 'found in meals/groceries/etc' as note
FROM (
  SELECT user_id FROM meals
  UNION
  SELECT user_id FROM groceries
  UNION
  SELECT user_id FROM user_preferences
  UNION
  SELECT user_id FROM cuisine_overrides
  UNION
  SELECT user_id FROM disabled_items
) all_user_ids;

