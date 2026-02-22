-- PATCH: Fix RLS Policy for Plan Change Requests
-- Run this in your Supabase SQL Editor to allow users to submit upgrade requests.

-- 1. Enable RLS (Should be already on, but just in case)
ALTER TABLE public.plan_change_requests ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Requests own" ON public.plan_change_requests;
DROP POLICY IF EXISTS "Requests insert" ON public.plan_change_requests;
DROP POLICY IF EXISTS "Requests admin" ON public.plan_change_requests;

-- 3. Create the missing INSERT policy
CREATE POLICY "Requests insert" ON public.plan_change_requests 
FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- 4. Create SELECT policy for users to see their own status
CREATE POLICY "Requests own" ON public.plan_change_requests 
FOR SELECT TO authenticated 
USING (auth.uid() = user_id);

-- 5. Create absolute Admin control
CREATE POLICY "Requests admin" ON public.plan_change_requests 
FOR ALL TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMIN'
  )
);
