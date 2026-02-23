-- FIX: Allow dynamic document types (like 'SOP') by removing the hardcoded constraint
-- Run this in your Supabase SQL Editor:

ALTER TABLE public.documents 
DROP CONSTRAINT IF EXISTS documents_type_check;

-- Optional: Ensure the 'type' column remains flexible
ALTER TABLE public.documents 
ALTER COLUMN type SET DATA TYPE TEXT;
