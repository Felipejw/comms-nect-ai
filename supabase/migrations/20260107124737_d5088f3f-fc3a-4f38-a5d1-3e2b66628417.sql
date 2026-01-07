-- Fase 3: Corrigir políticas RLS permissivas

-- Corrigir contact_tags - apenas usuários autenticados podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage contact tags" ON public.contact_tags;
CREATE POLICY "Authenticated users can manage contact tags" 
ON public.contact_tags 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrigir conversation_tags - apenas usuários autenticados podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage conversation tags" ON public.conversation_tags;
CREATE POLICY "Authenticated users can manage conversation tags" 
ON public.conversation_tags 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrigir kanban_columns - apenas admin/manager podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can manage kanban columns" ON public.kanban_columns;
CREATE POLICY "Admins and managers can manage kanban columns" 
ON public.kanban_columns 
FOR ALL 
USING (is_admin_or_manager(auth.uid()))
WITH CHECK (is_admin_or_manager(auth.uid()));

-- Corrigir contacts - update apenas para autenticados
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.contacts;
CREATE POLICY "Authenticated users can update contacts" 
ON public.contacts 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Corrigir contacts - insert apenas para autenticados
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.contacts;
CREATE POLICY "Authenticated users can create contacts" 
ON public.contacts 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrigir conversations - update apenas para autenticados
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON public.conversations;
CREATE POLICY "Authenticated users can update conversations" 
ON public.conversations 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Corrigir conversations - insert apenas para autenticados  
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations" 
ON public.conversations 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrigir queues - update apenas para admin/manager
DROP POLICY IF EXISTS "Authenticated users can update queues" ON public.queues;
CREATE POLICY "Admins and managers can update queues" 
ON public.queues 
FOR UPDATE 
USING (is_admin_or_manager(auth.uid()));

-- Corrigir queues - insert apenas para admin/manager
DROP POLICY IF EXISTS "Authenticated users can create queues" ON public.queues;
CREATE POLICY "Admins and managers can create queues" 
ON public.queues 
FOR INSERT 
WITH CHECK (is_admin_or_manager(auth.uid()));

-- Corrigir tags - apenas admin/manager podem gerenciar
DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.tags;
DROP POLICY IF EXISTS "Authenticated users can update tags" ON public.tags;
DROP POLICY IF EXISTS "Authenticated users can delete tags" ON public.tags;

CREATE POLICY "Admins and managers can create tags" 
ON public.tags 
FOR INSERT 
WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update tags" 
ON public.tags 
FOR UPDATE 
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can delete tags" 
ON public.tags 
FOR DELETE 
USING (is_admin_or_manager(auth.uid()));

-- Corrigir messages - insert apenas para autenticados
DROP POLICY IF EXISTS "Authenticated users can create messages" ON public.messages;
CREATE POLICY "Authenticated users can create messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Corrigir google_calendar_events - restringir a autenticados
DROP POLICY IF EXISTS "Allow authenticated users to insert events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Allow authenticated users to update events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Allow authenticated users to delete events" ON public.google_calendar_events;
DROP POLICY IF EXISTS "Allow service role full access" ON public.google_calendar_events;

CREATE POLICY "Authenticated users can insert events" 
ON public.google_calendar_events 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update events" 
ON public.google_calendar_events 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete events" 
ON public.google_calendar_events 
FOR DELETE 
USING (auth.uid() IS NOT NULL);