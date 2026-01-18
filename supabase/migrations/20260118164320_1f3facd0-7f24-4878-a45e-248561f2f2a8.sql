-- =============================================
-- FASE 1A: ADICIONAR SUPER_ADMIN AO ENUM
-- =============================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'admin';