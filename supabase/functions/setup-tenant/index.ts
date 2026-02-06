import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('No Authorization header');
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.log('Auth error:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Setting up tenant for user:', user.id);

    // Check if user already has a tenant
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (existingProfile?.tenant_id) {
      console.log('User already has a tenant:', existingProfile.tenant_id);
      return new Response(
        JSON.stringify({ error: 'Usuário já possui uma empresa configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { company_name, plan_id } = await req.json();

    if (!company_name || company_name.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Nome da empresa é obrigatório (mínimo 2 caracteres)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate slug and ensure uniqueness
    let baseSlug = generateSlug(company_name.trim());
    if (!baseSlug) baseSlug = 'empresa';
    
    let slug = baseSlug;
    let slugSuffix = 1;

    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (!existing) break;
      
      slug = `${baseSlug}-${slugSuffix}`;
      slugSuffix++;
      
      if (slugSuffix > 100) {
        slug = `${baseSlug}-${Date.now()}`;
        break;
      }
    }

    console.log('Creating tenant with slug:', slug);

    // 1. Create tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: company_name.trim(),
        slug,
        owner_user_id: user.id,
        plan: 'basic',
        subscription_status: 'trial',
        is_active: true,
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Error creating tenant:', tenantError.message);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar empresa: ' + tenantError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Tenant created:', tenant.id);

    // 2. Update profile with tenant_id
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ tenant_id: tenant.id })
      .eq('user_id', user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError.message);
    }

    // 3. Promote user to admin role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', user.id);

    if (roleError) {
      console.error('Error updating role:', roleError.message);
    }

    // 4. Create trial subscription (14 days)
    // Use the selected plan_id or default to basic
    const selectedPlanId = plan_id || '08fabb60-5fb9-466e-9dc2-17aca0df337d';
    
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const { error: subError } = await supabaseAdmin
      .from('tenant_subscriptions')
      .insert({
        tenant_id: tenant.id,
        plan_id: selectedPlanId,
        billing_cycle: 'monthly',
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: trialEnd.toISOString(),
        trial_ends_at: trialEnd.toISOString(),
      });

    if (subError) {
      console.error('Error creating subscription:', subError.message);
    }

    // 5. Update tenant with subscription expiry
    await supabaseAdmin
      .from('tenants')
      .update({ subscription_expires_at: trialEnd.toISOString() })
      .eq('id', tenant.id);

    // 6. Log activity
    await supabaseAdmin.from('activity_logs').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      action: 'create',
      entity_type: 'tenant',
      entity_id: tenant.id,
      metadata: { company_name: company_name.trim(), slug, plan_id: selectedPlanId },
    });

    console.log('Tenant setup complete for user:', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
