-- Migration script for Account & Subscription Management

-- 1. Subscription Plans Table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    monthly_limit INTEGER NOT NULL, -- -1 for unlimited
    price DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial plans
INSERT INTO public.subscription_plans (name, monthly_limit, price) VALUES 
('Free', 5, 0.00),
('Extended', 50, 0.00), -- Price TBD
('Professional', -1, 0.00) -- Price TBD
ON CONFLICT (name) DO NOTHING;

-- 2. Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    address TEXT,
    plan_id UUID REFERENCES public.subscription_plans(id) DEFAULT (SELECT id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS Policies
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Plan visibility
CREATE POLICY "Public can view plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
-- Admin can manage plans (Anyone authenticated for now, as per user's 'App Owner' request)
CREATE POLICY "Admins can manage plans" ON public.subscription_plans FOR ALL TO authenticated USING (true);

-- Profile policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 4. Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan_id)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name',
    (SELECT id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Helper function to check monthly usage
CREATE OR REPLACE FUNCTION public.get_monthly_usage(target_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*) 
        FROM public.documents 
        WHERE user_id = target_user_id 
        AND created_at >= date_trunc('month', now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
