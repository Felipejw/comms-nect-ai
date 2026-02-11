
-- Add missing triggers for activity logging

-- Trigger for messages (INSERT only to avoid logging every is_read update)
CREATE TRIGGER trg_log_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Trigger for chatbot_flows
CREATE TRIGGER trg_log_chatbot_flows
  AFTER INSERT OR UPDATE OR DELETE ON public.chatbot_flows
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Trigger for system_settings
CREATE TRIGGER trg_log_system_settings
  AFTER INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Trigger for schedules
CREATE TRIGGER trg_log_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
