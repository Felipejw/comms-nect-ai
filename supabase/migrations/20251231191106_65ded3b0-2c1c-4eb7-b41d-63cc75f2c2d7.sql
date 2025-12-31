-- Drop the restrictive policy
DROP POLICY IF EXISTS "Admins and managers can manage flows" ON public.chatbot_flows;

-- INSERT: Any authenticated user can create flows
CREATE POLICY "Authenticated users can create flows"
ON public.chatbot_flows FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- UPDATE: Users can update own flows or admins/managers
CREATE POLICY "Users can update own flows or admins"
ON public.chatbot_flows FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR created_by IS NULL OR is_admin_or_manager(auth.uid()));

-- DELETE: Users can delete own flows or admins/managers
CREATE POLICY "Users can delete own flows or admins"
ON public.chatbot_flows FOR DELETE
TO authenticated
USING (created_by = auth.uid() OR created_by IS NULL OR is_admin_or_manager(auth.uid()));