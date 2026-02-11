
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_user_id uuid;
  v_metadata jsonb;
  v_row record;
BEGIN
  CASE TG_OP
    WHEN 'INSERT' THEN v_action := 'create';
    WHEN 'UPDATE' THEN v_action := 'update';
    WHEN 'DELETE' THEN v_action := 'delete';
    ELSE v_action := lower(TG_OP);
  END CASE;

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

  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  v_entity_id := v_row.id::text;
  v_user_id := auth.uid();

  -- Fallback: tentar extrair user_id de campos da propria tabela
  IF v_user_id IS NULL THEN
    CASE TG_TABLE_NAME
      WHEN 'conversations' THEN v_user_id := COALESCE(NEW.assigned_to, OLD.assigned_to);
      WHEN 'messages' THEN v_user_id := NEW.sender_id;
      WHEN 'campaigns' THEN v_user_id := COALESCE(NEW.created_by, OLD.created_by);
      WHEN 'chatbot_flows' THEN v_user_id := COALESCE(NEW.created_by, OLD.created_by);
      WHEN 'quick_replies' THEN v_user_id := COALESCE(NEW.created_by, OLD.created_by);
      WHEN 'schedules' THEN v_user_id := COALESCE(NEW.user_id, OLD.user_id);
      ELSE NULL;
    END CASE;
  END IF;

  v_metadata := '{}'::jsonb;

  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('name', NEW.name, 'phone', NEW.phone);
      ELSIF TG_OP = 'UPDATE' THEN
        v_metadata := jsonb_build_object('name', NEW.name);
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := v_metadata || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status); END IF;
      ELSIF TG_OP = 'DELETE' THEN v_metadata := jsonb_build_object('name', OLD.name, 'phone', OLD.phone);
      END IF;
    WHEN 'conversations' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('status', NEW.status, 'contact_id', NEW.contact_id);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        ELSE RETURN v_row; END IF;
      END IF;
    WHEN 'connections' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('name', NEW.name, 'type', NEW.type);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status, 'new_status', NEW.status);
        ELSE RETURN v_row; END IF;
      ELSIF TG_OP = 'DELETE' THEN v_metadata := jsonb_build_object('name', OLD.name, 'type', OLD.type);
      END IF;
    WHEN 'campaigns' THEN
      IF TG_OP = 'INSERT' THEN v_metadata := jsonb_build_object('name', NEW.name, 'status', NEW.status);
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN v_metadata := jsonb_build_object('name', NEW.name, 'old_status', OLD.status::text, 'new_status', NEW.status::text);
        ELSE RETURN v_row; END IF;
      END IF;
    WHEN 'tags' THEN v_metadata := jsonb_build_object('name', COALESCE(NEW.name, OLD.name), 'color', COALESCE(NEW.color, OLD.color));
    WHEN 'quick_replies' THEN v_metadata := jsonb_build_object('title', COALESCE(NEW.title, OLD.title), 'shortcut', COALESCE(NEW.shortcut, OLD.shortcut));
    WHEN 'chatbot_rules' THEN v_metadata := jsonb_build_object('trigger_text', COALESCE(NEW.trigger_text, OLD.trigger_text));
    ELSE v_metadata := '{}'::jsonb;
  END CASE;

  INSERT INTO public.activity_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES (v_action, v_entity_type, v_entity_id, v_user_id, v_metadata);
  RETURN v_row;
END;
$function$;
