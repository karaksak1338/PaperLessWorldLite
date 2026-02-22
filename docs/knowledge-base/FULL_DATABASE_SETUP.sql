-- MASTER SETUP: DocuVault Pro Complete Database Schema
-- Includes: Documents, Profiles, Subscription Plans, Audit Logs, and Governance Triggers

-- ==========================================
-- 1. ENUMS & TYPES
-- ==========================================
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('USER', 'ADMIN');
    CREATE TYPE public.user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
    CREATE TYPE public.subscription_state AS ENUM ('ACTIVE', 'PENDING_CHANGE', 'CANCELLED', 'EXPIRED');
    CREATE TYPE public.request_type AS ENUM ('UPGRADE', 'DOWNGRADE', 'CANCEL');
    CREATE TYPE public.request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==========================================
-- 2. CORE TABLES
-- ==========================================

-- Document Types
CREATE TABLE IF NOT EXISTS public.document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    plan_code TEXT UNIQUE,
    monthly_limit INTEGER NOT NULL, -- -1 for unlimited
    price DECIMAL(10, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    modified_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    address TEXT,
    role public.user_role DEFAULT 'USER',
    status public.user_status DEFAULT 'ACTIVE',
    subscription_state public.subscription_state DEFAULT 'ACTIVE',
    plan_id UUID REFERENCES public.subscription_plans(id),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Documents
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_uri TEXT NOT NULL,
    vendor TEXT,
    date DATE,
    amount DECIMAL(10, 2),
    type TEXT,
    reminder_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Plan Change Requests
CREATE TABLE IF NOT EXISTS public.plan_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    request_type public.request_type NOT NULL,
    current_plan_id UUID REFERENCES public.subscription_plans(id),
    requested_plan_id UUID REFERENCES public.subscription_plans(id),
    status public.request_status DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ DEFAULT now(),
    effective_at TIMESTAMPTZ,
    admin_notes TEXT,
    processed_by UUID REFERENCES auth.users(id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 3. SEED DATA
-- ==========================================
INSERT INTO public.document_types (name, color) VALUES 
('Invoice', '#6366f1'),
('Contract', '#a855f7'),
('Receipt', '#10b981'),
('Other', '#71717a')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.subscription_plans (name, plan_code, monthly_limit, price) VALUES 
('Free', 'PLAN_A', 5, 0.00),
('Extended', 'PLAN_B', 50, 0.00),
('Professional', 'PLAN_C', -1, 0.00)
ON CONFLICT (name) DO UPDATE SET plan_code = EXCLUDED.plan_code;

-- ==========================================
-- 4. FUNCTIONS & TRIGGERS
-- ==========================================

-- Helper: Check if current user is Admin (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT (role = 'ADMIN')
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: Get Monthly Usage
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

-- Trigger: Create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan_id)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'full_name',
    (SELECT id FROM public.subscription_plans WHERE plan_code = 'PLAN_A' LIMIT 1)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Quota Enforcement
CREATE OR REPLACE FUNCTION public.validate_quota()
RETURNS TRIGGER AS $$
DECLARE
    u_plan_id UUID;
    u_max INTEGER;
    u_current INTEGER;
BEGIN
    SELECT plan_id INTO u_plan_id FROM public.profiles WHERE id = NEW.user_id;
    SELECT monthly_limit INTO u_max FROM public.subscription_plans WHERE id = u_plan_id;
    SELECT COUNT(*) INTO u_current FROM public.documents WHERE user_id = NEW.user_id AND created_at >= date_trunc('month', now());

    IF u_max <> -1 AND u_current >= u_max THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_enforce_quota ON public.documents;
CREATE TRIGGER tr_enforce_quota
    BEFORE INSERT ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.validate_quota();

-- Function: Request Plan Change
CREATE OR REPLACE FUNCTION public.request_plan_change(target_plan_id UUID, type public.request_type) 
RETURNS UUID AS $$
DECLARE
    current_state public.subscription_state;
    current_usage INTEGER;
    target_limit INTEGER;
    new_request_id UUID;
BEGIN
    SELECT subscription_state INTO current_state FROM public.profiles WHERE id = auth.uid();
    -- Check if a request already exists to prevent duplicates (already done by subscription_state check but double safety)
    IF current_state = 'PENDING_CHANGE' THEN
        RAISE EXCEPTION 'CHANGE_ALREADY_PENDING' USING ERRCODE = 'P0002';
    END IF;

    -- Quota Enforcement on Downgrade
    IF type = 'DOWNGRADE' THEN
        SELECT monthly_limit INTO target_limit FROM public.subscription_plans WHERE id = target_plan_id;
        SELECT public.get_monthly_usage(auth.uid()) INTO current_usage;
        -- If target is not unlimited (-1) and current usage exceeds it
        IF target_limit <> -1 AND current_usage > target_limit THEN
            RAISE EXCEPTION 'QUOTA_CONFLICT' USING ERRCODE = 'P0003';
        END IF;
    END IF;

    INSERT INTO public.plan_change_requests (user_id, request_type, current_plan_id, requested_plan_id)
    VALUES (auth.uid(), type, (SELECT plan_id FROM public.profiles WHERE id = auth.uid()), target_plan_id)
    RETURNING id INTO new_request_id;

    UPDATE public.profiles SET subscription_state = 'PENDING_CHANGE' WHERE id = auth.uid();
    RETURN new_request_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Audit Logging
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
BEGIN
    IF (TG_OP = 'UPDATE') THEN old_val := to_jsonb(OLD); new_val := to_jsonb(NEW);
    ELSIF (TG_OP = 'INSERT') THEN new_val := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN old_val := to_jsonb(OLD);
    END IF;

    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, old_val, new_val, auth.uid());
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_audit_profiles ON public.profiles;
CREATE TRIGGER tr_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ==========================================
-- 5. RLS POLICIES
-- ==========================================
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Documents (Own data only)
DROP POLICY IF EXISTS "Docs own" ON public.documents;
CREATE POLICY "Docs own" ON public.documents FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Document Types (Viewable by all)
DROP POLICY IF EXISTS "Types view" ON public.document_types;
CREATE POLICY "Types view" ON public.document_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Types admin" ON public.document_types;
CREATE POLICY "Types admin" ON public.document_types FOR ALL TO authenticated USING (public.is_admin());

-- Profiles (Own view/update, Admin all)
DROP POLICY IF EXISTS "Profile own" ON public.profiles;
CREATE POLICY "Profile own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profile update" ON public.profiles;
CREATE POLICY "Profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profile admin" ON public.profiles;
CREATE POLICY "Profile admin" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

-- Plans (Viewable by all, Admin manage)
DROP POLICY IF EXISTS "Plans view" ON public.subscription_plans;
CREATE POLICY "Plans view" ON public.subscription_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Plans admin" ON public.subscription_plans;
CREATE POLICY "Plans admin" ON public.subscription_plans FOR ALL TO authenticated USING (public.is_admin());

-- Requests (Own view/insert, Admin all)
DROP POLICY IF EXISTS "Requests own" ON public.plan_change_requests;
CREATE POLICY "Requests own" ON public.plan_change_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Requests insert" ON public.plan_change_requests;
CREATE POLICY "Requests insert" ON public.plan_change_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Requests admin" ON public.plan_change_requests;
CREATE POLICY "Requests admin" ON public.plan_change_requests FOR ALL TO authenticated USING (public.is_admin());

-- Audits (Admin only)
DROP POLICY IF EXISTS "Audits admin" ON public.audit_logs;
CREATE POLICY "Audits admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

-- ==========================================
-- 6. STORAGE BUCKETS
-- ==========================================
-- (Run manually if needed, or included for completeness)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT (id) DO NOTHING;
