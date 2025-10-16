-- Link all existing demo data to your household
-- Your household ID: 5cc187b9-7b6d-481b-b544-43887a26621d

DO $$
DECLARE
  my_household_id UUID := '5cc187b9-7b6d-481b-b544-43887a26621d';
  demo_user_id TEXT := 'demo-user-123';
  rows_updated INTEGER;
BEGIN
  -- 1. Update meals
  UPDATE meals 
  SET household_id = my_household_id
  WHERE user_id = demo_user_id;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % meals', rows_updated;

  -- 2. Update groceries
  UPDATE groceries 
  SET household_id = my_household_id
  WHERE user_id = demo_user_id;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % groceries', rows_updated;

  -- 3. Update user_preferences
  UPDATE user_preferences 
  SET household_id = my_household_id
  WHERE user_id = demo_user_id;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % user_preferences', rows_updated;

  -- 4. Update cuisine_overrides
  UPDATE cuisine_overrides 
  SET household_id = my_household_id
  WHERE user_id = demo_user_id;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % cuisine_overrides', rows_updated;

  -- 5. Update disabled_items
  UPDATE disabled_items 
  SET household_id = my_household_id
  WHERE user_id = demo_user_id;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % disabled_items', rows_updated;

  RAISE NOTICE '✅ All demo data has been linked to your household!';
END $$;

-- Verify the migration worked
SELECT 'meals' as table_name, COUNT(*) as count 
FROM meals 
WHERE household_id = '5cc187b9-7b6d-481b-b544-43887a26621d'
UNION ALL
SELECT 'groceries', COUNT(*) 
FROM groceries 
WHERE household_id = '5cc187b9-7b6d-481b-b544-43887a26621d'
UNION ALL
SELECT 'user_preferences', COUNT(*) 
FROM user_preferences 
WHERE household_id = '5cc187b9-7b6d-481b-b544-43887a26621d'
UNION ALL
SELECT 'cuisine_overrides', COUNT(*) 
FROM cuisine_overrides 
WHERE household_id = '5cc187b9-7b6d-481b-b544-43887a26621d'
UNION ALL
SELECT 'disabled_items', COUNT(*) 
FROM disabled_items 
WHERE household_id = '5cc187b9-7b6d-481b-b544-43887a26621d';

