-- Supabase Schema for PaperLessWorldLite

-- 1. Document Types Table (For dynamic management)
CREATE TABLE IF NOT EXISTS public.document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial types
INSERT INTO public.document_types (name, color) VALUES 
('Invoice', '#6366f1'),
('Contract', '#a855f7'),
('Receipt', '#10b981'),
('Other', '#71717a')
ON CONFLICT (name) DO NOTHING;

-- 2. Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_uri TEXT NOT NULL,
    vendor TEXT,
    date DATE,
    amount DECIMAL(10, 2),
    type TEXT, -- Dynamic reference to document_types.name or ID
    reminder_date DATE, -- New: optional date for user reminders
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Row Level Security (RLS)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view types
CREATE POLICY "Anyone can view document types"
ON public.document_types FOR SELECT
TO authenticated
USING (true);

-- For now, allow anyone authenticated to manage types (Admin-lite)
CREATE POLICY "Anyone can manage document types"
ON public.document_types FOR ALL
TO authenticated
USING (true);

-- 3. Policies
CREATE POLICY "Users can create their own documents"
ON public.documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own documents"
ON public.documents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
ON public.documents FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON public.documents FOR DELETE
USING (auth.uid() = user_id);

-- 4. Storage Setup
-- Run this in your Supabase SQL Editor to create the bucket and policies
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Policies (Allow authenticated users to manage their own files)
-- We enforce the path 'user_id/filename' for all uploads
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
);
