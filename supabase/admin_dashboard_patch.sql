-- 🛠️ ADMIN DASHBOARD PATCH
-- Add email syncing to profiles and optimize relationship for Admin Dashboard

-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Update existing profiles with emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 3. Update the handle_new_user trigger function to sync email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan_id, email)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name',
    (SELECT id FROM public.subscription_plans WHERE name = 'Free' LIMIT 1),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Optimize FK for plan_change_requests to point to profiles(id)
-- This makes joining for metadata in the Admin Dashboard more reliable
ALTER TABLE public.plan_change_requests 
DROP CONSTRAINT IF EXISTS plan_change_requests_user_id_fkey,
ADD CONSTRAINT plan_change_requests_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) 
    ON DELETE CASCADE;
