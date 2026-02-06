
-- 1. Criar tenant principal para o super admin existente
INSERT INTO public.tenants (name, slug, owner_user_id, plan, subscription_status, is_active)
VALUES ('Admin Principal', 'admin-principal', '33c631a4-a9c5-4623-85c2-eb7d604298df', 'basic', 'trial', true);

-- 2. Atualizar todos os perfis existentes com o tenant_id
UPDATE public.profiles SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'admin-principal')
WHERE tenant_id IS NULL;

-- 3. Criar subscription trial (14 dias, plano Basico)
INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end, trial_ends_at)
VALUES (
  (SELECT id FROM public.tenants WHERE slug = 'admin-principal'),
  '08fabb60-5fb9-466e-9dc2-17aca0df337d',
  'monthly',
  'active',
  now(),
  now() + interval '14 days',
  now() + interval '14 days'
);
