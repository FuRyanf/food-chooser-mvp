-- Food Chooser MVP Database Schema
-- Run this in your Supabase SQL editor

-- Enable Row Level Security (RLS)
-- ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret-here';

-- Create tables
CREATE TABLE IF NOT EXISTS public.meals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    restaurant TEXT,
    dish TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    cost DECIMAL(10,2) NOT NULL CHECK (cost >= 0),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    notes TEXT,
    seed_only BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    budget_min DECIMAL(10,2) NOT NULL DEFAULT 10.00 CHECK (budget_min >= 0),
    budget_max DECIMAL(10,2) NOT NULL DEFAULT 35.00 CHECK (budget_max >= budget_min),
    forbid_repeat_days INTEGER NOT NULL DEFAULT 1 CHECK (forbid_repeat_days >= 0),
    strict_budget BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cuisine_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, cuisine)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON public.meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON public.meals(date);
CREATE INDEX IF NOT EXISTS idx_meals_cuisine ON public.meals(cuisine);
CREATE INDEX IF NOT EXISTS idx_meals_seed_only ON public.meals(seed_only);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_cuisine_overrides_user_id ON public.cuisine_overrides(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_meals_updated_at BEFORE UPDATE ON public.meals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cuisine_overrides_updated_at BEFORE UPDATE ON public.cuisine_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuisine_overrides ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- For now, we'll allow all operations for the demo user
-- In production, you'd implement proper authentication

-- Meals policies
CREATE POLICY "Allow all operations for demo user" ON public.meals
    FOR ALL USING (user_id = 'demo-user-123');

-- User preferences policies
CREATE POLICY "Allow all operations for demo user" ON public.user_preferences
    FOR ALL USING (user_id = 'demo-user-123');

-- Cuisine overrides policies
CREATE POLICY "Allow all operations for demo user" ON public.cuisine_overrides
    FOR ALL USING (user_id = 'demo-user-123');

-- Insert some sample data for the demo user
INSERT INTO public.user_preferences (user_id, budget_min, budget_max, forbid_repeat_days, strict_budget)
VALUES ('demo-user-123', 10.00, 35.00, 1, false)
ON CONFLICT (user_id) DO NOTHING;

-- Grant necessary permissions
GRANT ALL ON public.meals TO anon, authenticated;
GRANT ALL ON public.user_preferences TO anon, authenticated;
GRANT ALL ON public.cuisine_overrides TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Add monthly_budget to user_preferences if not exists
DO $$ BEGIN
  ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS monthly_budget DECIMAL(10,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Disabled items table
CREATE TABLE IF NOT EXISTS public.disabled_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    restaurant_norm TEXT NOT NULL,
    dish_norm TEXT NOT NULL,
    disabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, restaurant_norm, dish_norm)
);

CREATE INDEX IF NOT EXISTS idx_disabled_items_user ON public.disabled_items(user_id);

CREATE TRIGGER update_disabled_items_updated_at BEFORE UPDATE ON public.disabled_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (optional/demo): allow operations for demo user
ALTER TABLE public.disabled_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all operations for demo user" ON public.disabled_items
    FOR ALL USING (user_id = 'demo-user-123');

GRANT ALL ON public.disabled_items TO anon, authenticated;

-- Groceries table
CREATE TABLE IF NOT EXISTS public.groceries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    notes TEXT,
    trip_label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groceries_user_date ON public.groceries(user_id, date DESC);

CREATE TRIGGER update_groceries_updated_at BEFORE UPDATE ON public.groceries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.groceries ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all operations for demo user" ON public.groceries
    FOR ALL USING (user_id = 'demo-user-123');

GRANT ALL ON public.groceries TO anon, authenticated;

DO $$ BEGIN
  ALTER TABLE public.groceries ADD COLUMN IF NOT EXISTS trip_label TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
