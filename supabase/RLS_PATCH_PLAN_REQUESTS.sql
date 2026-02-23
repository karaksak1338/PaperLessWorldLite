-- FIX: Allow users to request plan changes for themselves
-- Run this in your Supabase SQL Editor:

DROP POLICY IF EXISTS "Users can insert own requests" ON public.plan_change_requests;

CREATE POLICY "Users can insert own requests" 
ON public.plan_change_requests FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);
