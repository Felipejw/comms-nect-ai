
-- Function to automatically log activity on CRUD operations
CREATE OR REPLACE FUNCTION public.log_activity()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_tenant_id uuid;
  v_user_id uuid;
  v_metadata jsonb;
  v_row record;
BEGIN
  -- Determine action
  CASE TG_OP
    WHEN 'INSERT' THEN v_action := 'create';
    WHEN 'UPDATE' THEN v_action := 'update';
    WHEN 'DELETE' THEN v_action := 'delete';
    ELSE v_action := lower(TG_OP);
  END CASE;

  -- Entity type from table name (singularize common cases)
  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN v_entity_type := 'contact';
    WHEN 'conversations' THEN v_entity_type := 'conversation';
    WHEN 'connections' THEN v_entity_type := 'connection';
    WHEN 'campaigns' THEN v_entity_type := 'campaign';
    WHEN 'tags' THEN v_entity_type := 'tag';
    WHEN 'quick_replies' THEN v_entity_type := 'quick_reply';
    WHEN 'chatbot_rules' THEN v_entity_type := 'chatbot_rule';
    ELSE v_entity_type := TG_TABLE_NAME;
  END CASE;

  -- Use NEW for INSERT/UPDATE, OLD for DELETE
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  -- Extract entity_id
  v_entity_id := v_row.id::text;

  -- Extract tenant_id (all tracked tables have tenant_id)
  v_tenant_id := v_row.tenant_id;

  -- Get current user (NULL for system/service_role operations)
  v_user_id := auth.uid();

  -- Build metadata based on table and operation
  v_metadata := '{}'::jsonb;

  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('name', NEW.name, 'phone', NEW.phone);
      ELSIF TG_OP = 'UPDATE' THEN
        v_metadata := jsonb_build_object('name', NEW.name);
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := v_metadata || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        v_metadata := jsonb_build_object('name', OLD.name, 'phone', OLD.phone);
      END IF;

    WHEN 'conversations' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('status', NEW.status, 'contact_id', NEW.contact_id);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        ELSE
          -- Skip logging if status didn't change (avoids noise from last_message_at updates)
          RETURN v_row;
        END IF;
      END IF;

    WHEN 'connections' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('name', NEW.name, 'type', NEW.type);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status, 'new_status', NEW.status);
        ELSE
          RETURN v_row;
        END IF;
      ELSIF TG_OP = 'DELETE' THEN
        v_metadata := jsonb_build_object('name', OLD.name, 'type', OLD.type);
      END IF;

    WHEN 'campaigns' THEN
      IF TG_OP = 'INSERT' THEN
        v_metadata := jsonb_build_object('name', NEW.name, 'status', NEW.status);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
          v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status::text, 'new_status', NEW.status::text);
        ELSE
          RETURN v_row;
        END IF;
      END IF;

    WHEN 'tags' THEN
      v_metadata := jsonb_build_object('name', COALESCE(NEW.name, OLD.name), 'color', COALESCE(NEW.color, OLD.color));

    WHEN 'quick_replies' THEN
      v_metadata := jsonb_build_object('title', COALESCE(NEW.title, OLD.title), 'shortcut', COALESCE(NEW.shortcut, OLD.shortcut));

    WHEN 'chatbot_rules' THEN
      v_metadata := jsonb_build_object('trigger_text', COALESCE(NEW.trigger_text, OLD.trigger_text));

    ELSE
      v_metadata := '{}'::jsonb;
  END CASE;

  -- Insert into activity_logs
  INSERT INTO public.activity_logs (action, entity_type, entity_id, tenant_id, user_id, metadata)
  VALUES (v_action, v_entity_type, v_entity_id, v_tenant_id, v_user_id, v_metadata);

  RETURN v_row;
END;
$$;

-- Create triggers on critical tables
CREATE TRIGGER trg_log_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TRIGGER trg_log_conversations
  AFTER INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TRIGGER trg_log_connections
  AFTER INSERT OR UPDATE OR DELETE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TRIGGER trg_log_campaigns
  AFTER INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TRIGGER trg_log_tags
  AFTER INSERT OR DELETE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TRIGGER trg_log_quick_replies
  AFTER INSERT OR UPDATE OR DELETE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

CREATE TRIGGER trg_log_chatbot_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.chatbot_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Ensure activity_logs has proper RLS for service_role inserts from edge functions
-- The table already has RLS enabled; add a policy allowing service_role inserts
-- (service_role bypasses RLS by default, so no extra policy needed for edge functions)
-- But ensure users can read logs from their tenant
DO $$
BEGIN
  -- Check if policy exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'activity_logs' AND policyname = 'Users can view activity logs from their tenant'
  ) THEN
    CREATE POLICY "Users can view activity logs from their tenant"
      ON public.activity_logs
      FOR SELECT
      USING (
        is_super_admin(auth.uid())
        OR tenant_id = get_user_tenant_id(auth.uid())
        OR tenant_id IS NULL
      );
  END IF;
END $$;
