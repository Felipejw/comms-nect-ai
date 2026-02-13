
-- Fix 1: Remove duplicate SELECT policy on profiles (keep the one with auth check, drop the overly permissive one)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Fix 2: Restrict activity_logs INSERT to authenticated users only (was WITH CHECK (true))
DROP POLICY IF EXISTS "System can create activity logs" ON public.activity_logs;

CREATE POLICY "Authenticated users can create activity logs" 
ON public.activity_logs 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);
