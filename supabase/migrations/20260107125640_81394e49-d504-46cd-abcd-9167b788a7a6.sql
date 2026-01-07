-- Função para incrementar delivered_count
CREATE OR REPLACE FUNCTION public.increment_campaign_delivered(campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE campaigns 
  SET delivered_count = COALESCE(delivered_count, 0) + 1
  WHERE id = campaign_id;
END;
$$;

-- Função para incrementar read_count
CREATE OR REPLACE FUNCTION public.increment_campaign_read(
  campaign_id uuid, 
  was_delivered boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE campaigns 
  SET 
    read_count = COALESCE(read_count, 0) + 1,
    delivered_count = CASE 
      WHEN was_delivered THEN delivered_count 
      ELSE COALESCE(delivered_count, 0) + 1 
    END
  WHERE id = campaign_id;
END;
$$;