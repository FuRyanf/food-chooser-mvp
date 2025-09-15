-- Person Tracking Migration for Food Chooser MVP
-- Run this in your Supabase SQL editor to add person tracking to existing data

-- Add purchaser_name column to meals table
ALTER TABLE public.meals 
ADD COLUMN IF NOT EXISTS purchaser_name TEXT DEFAULT 'Unknown';

-- Add purchaser_name column to groceries table  
ALTER TABLE public.groceries 
ADD COLUMN IF NOT EXISTS purchaser_name TEXT DEFAULT 'Unknown';

-- Create indexes for efficient querying by purchaser
CREATE INDEX IF NOT EXISTS idx_meals_purchaser ON public.meals(purchaser_name);
CREATE INDEX IF NOT EXISTS idx_groceries_purchaser ON public.groceries(purchaser_name);

-- Create a view for detailed spending aggregates per person and category
CREATE OR REPLACE VIEW public.spending_summary AS
WITH meal_spending AS (
    SELECT 
        purchaser_name,
        'meals' as category,
        COUNT(*) as transaction_count,
        SUM(cost) as total_amount,
        AVG(cost) as avg_amount,
        MIN(cost) as min_amount,
        MAX(cost) as max_amount,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
    FROM public.meals 
    WHERE purchaser_name != 'Unknown'
    GROUP BY purchaser_name
),
grocery_spending AS (
    SELECT 
        purchaser_name,
        'groceries' as category,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
    FROM public.groceries 
    WHERE purchaser_name != 'Unknown'
    GROUP BY purchaser_name
)
SELECT * FROM meal_spending
UNION ALL
SELECT * FROM grocery_spending
ORDER BY purchaser_name, category;

-- Create a summary view showing totals per person across all categories
CREATE OR REPLACE VIEW public.person_totals AS
SELECT 
    purchaser_name,
    COUNT(*) as total_transactions,
    SUM(total_amount) as total_spent,
    AVG(total_amount) as avg_per_category,
    MIN(earliest_date) as first_purchase,
    MAX(latest_date) as last_purchase
FROM public.spending_summary 
GROUP BY purchaser_name
ORDER BY total_spent DESC;

-- Grant permissions on the new views
GRANT SELECT ON public.spending_summary TO anon, authenticated;
GRANT SELECT ON public.person_totals TO anon, authenticated;

-- Optional: Update existing data with sample purchaser names
-- Uncomment and modify these if you want to assign existing records to people
/*
UPDATE public.meals 
SET purchaser_name = 'Ryan' 
WHERE purchaser_name = 'Unknown' 
AND id IN (SELECT id FROM public.meals WHERE purchaser_name = 'Unknown' LIMIT 5);

UPDATE public.meals 
SET purchaser_name = 'Rachel' 
WHERE purchaser_name = 'Unknown' 
AND id IN (SELECT id FROM public.meals WHERE purchaser_name = 'Unknown' LIMIT 5);

UPDATE public.groceries 
SET purchaser_name = 'Ryan' 
WHERE purchaser_name = 'Unknown'
AND id IN (SELECT id FROM public.groceries WHERE purchaser_name = 'Unknown' LIMIT 2);

UPDATE public.groceries 
SET purchaser_name = 'Rachel' 
WHERE purchaser_name = 'Unknown';
*/
