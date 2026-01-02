-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins and managers can manage queues" ON public.queues;

-- Create new policies that allow authenticated users to manage queues
CREATE POLICY "Authenticated users can create queues" 
ON public.queues 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update queues" 
ON public.queues 
FOR UPDATE 
USING (true);

CREATE POLICY "Authenticated users can delete queues" 
ON public.queues 
FOR DELETE 
USING (is_admin_or_manager(auth.uid()));