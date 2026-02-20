-- Migration: Identity & Subscription Governance

-- 1. Types & Enums
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('USER', 'ADMIN');
    CREATE TYPE public.user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
    CREATE TYPE public.subscription_state AS ENUM ('ACTIVE', 'PENDING_CHANGE', 'CANCELLED', 'EXPIRED');
    CREATE TYPE public.request_type AS ENUM ('UPGRADE', 'DOWNGRADE', 'CANCEL');
    CREATE TYPE public.request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Profiles Update
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS role public.user_role DEFAULT 'USER',
    ADD COLUMN IF NOT EXISTS status public.user_status DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS subscription_state public.subscription_state DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS company TEXT;

-- 3. Subscription Plans Update
ALTER TABLE public.subscription_plans 
    ADD COLUMN IF NOT EXISTS plan_code TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ DEFAULT now();

-- Seed formal plan codes
UPDATE public.subscription_plans SET plan_code = 'PLAN_A' WHERE name = 'Free';
UPDATE public.subscription_plans SET plan_code = 'PLAN_B' WHERE name = 'Extended';
UPDATE public.subscription_plans SET plan_code = 'PLAN_C' WHERE name = 'Professional';

-- 4. Plan Change Requests Table
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

-- 5. Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Quota Enforcement Logic (Server Authoritative)
CREATE OR REPLACE FUNCTION public.validate_quota()
RETURNS TRIGGER AS $$
DECLARE
    u_plan_id UUID;
    u_max INTEGER;
    u_current INTEGER;
BEGIN
    -- Get user plan limits
    SELECT plan_id INTO u_plan_id FROM public.profiles WHERE id = NEW.user_id;
    SELECT monthly_limit INTO u_max FROM public.subscription_plans WHERE id = u_plan_id;
    
    -- Count this month's uploads
    SELECT COUNT(*) INTO u_current 
    FROM public.documents 
    WHERE user_id = NEW.user_id 
    AND created_at >= date_trunc('month', now());

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

-- 7. Governance Policies (RLS)
ALTER TABLE public.plan_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own requests
CREATE POLICY "Users can view own requests" ON public.plan_change_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Admins can do everything
CREATE POLICY "Admins manage everything" ON public.plan_change_requests FOR ALL TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Only admins see audit logs
CREATE POLICY "Admins view audits" ON public.audit_logs FOR SELECT TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- 8. Plan Change Logic (Race condition protection & Quota Conflict)
CREATE OR REPLACE FUNCTION public.request_plan_change(
    target_plan_id UUID, 
    type public.request_type
) RETURNS UUID AS $$
DECLARE
    current_state public.subscription_state;
    current_usage INTEGER;
    target_limit INTEGER;
    new_request_id UUID;
BEGIN
    -- 1. Check for pending changes
    SELECT subscription_state INTO current_state FROM public.profiles WHERE id = auth.uid();
    IF current_state = 'PENDING_CHANGE' THEN
        RAISE EXCEPTION 'CHANGE_ALREADY_PENDING' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Downgrade safety check (Quota Conflict)
    IF type = 'DOWNGRADE' THEN
        SELECT monthly_limit INTO target_limit FROM public.subscription_plans WHERE id = target_plan_id;
        SELECT public.get_monthly_usage(auth.uid()) INTO current_usage;
        
        IF target_limit <> -1 AND current_usage > target_limit THEN
            RAISE EXCEPTION 'QUOTA_CONFLICT' USING ERRCODE = 'P0003';
        END IF;
    END IF;

    -- 3. Create request
    INSERT INTO public.plan_change_requests (user_id, request_type, current_plan_id, requested_plan_id)
    VALUES (
        auth.uid(), 
        type, 
        (SELECT plan_id FROM public.profiles WHERE id = auth.uid()), 
        target_plan_id
    ) RETURNING id INTO new_request_id;

    -- 4. Update profile state
    UPDATE public.profiles SET subscription_state = 'PENDING_CHANGE' WHERE id = auth.uid();

    RETURN new_request_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Audit Logging Trigger Function
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        old_val := to_jsonb(OLD);
        new_val := to_jsonb(NEW);
    ELSIF (TG_OP = 'INSERT') THEN
        new_val := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        old_val := to_jsonb(OLD);
    END IF;

    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, old_val, new_val, auth.uid());

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply auditing to sensitive tables
DROP TRIGGER IF EXISTS tr_audit_profiles ON public.profiles;
CREATE TRIGGER tr_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS tr_audit_plans ON public.subscription_plans;
CREATE TRIGGER tr_audit_plans AFTER INSERT OR UPDATE OR DELETE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

DROP TRIGGER IF EXISTS tr_audit_requests ON public.plan_change_requests;
CREATE TRIGGER tr_audit_requests AFTER INSERT OR UPDATE OR DELETE ON public.plan_change_requests FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
