-- Drop the restrictive policy for tag management
DROP POLICY IF EXISTS "Admins and managers can manage tags" ON public.tags;

-- Create separate policies for each operation
CREATE POLICY "Authenticated users can create tags" 
ON public.tags 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update tags" 
ON public.tags 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete tags" 
ON public.tags 
FOR DELETE 
TO authenticated
USING (true);