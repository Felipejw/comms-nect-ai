import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, name, role = 'atendente', permissions = [] } = await req.json();

    console.log(`Creating user with email: ${email}, role: ${role}, permissions count: ${permissions.length}`);

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create user using admin API
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        name: name || email.split('@')[0],
      },
    });

    if (error) {
      console.error('Error creating user:', error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('User created successfully:', data.user?.id);

    // If the user was created and role is not the default, update it
    if (data.user && role === 'admin') {
      // Wait a moment for the trigger to create the default role
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update the role to admin
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: 'admin' })
        .eq('user_id', data.user.id);
      
      if (roleError) {
        console.error('Error updating role:', roleError.message);
      } else {
        console.log('Role updated to admin');
      }
    }

    // Save permissions for atendente users
    if (data.user && role !== 'admin' && permissions.length > 0) {
      console.log('Saving permissions for user:', data.user.id);
      
      const permissionsToInsert = permissions.map((p: { module: string; can_view: boolean; can_edit: boolean }) => ({
        user_id: data.user!.id,
        module: p.module,
        can_view: p.can_view,
        can_edit: p.can_edit,
      }));

      const { error: permError } = await supabaseAdmin
        .from('user_permissions')
        .insert(permissionsToInsert);

      if (permError) {
        console.error('Error saving permissions:', permError.message);
      } else {
        console.log('Permissions saved successfully');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User created successfully',
        userId: data.user?.id 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
