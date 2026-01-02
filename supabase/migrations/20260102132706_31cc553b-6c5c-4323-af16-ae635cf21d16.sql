-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;

-- Create new policy allowing all authenticated users to view roles
CREATE POLICY "Authenticated users can view all roles"
ON user_roles FOR SELECT
TO authenticated
USING (true);