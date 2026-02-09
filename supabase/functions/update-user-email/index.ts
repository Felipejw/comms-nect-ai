import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { userId, newEmail } = await req.json()

    if (!userId || !newEmail) {
      throw new Error('userId e newEmail são obrigatórios')
    }

    console.log(`Updating email for user ${userId} to ${newEmail}`)

    // Atualizar email no auth.users usando API Admin
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail, email_confirm: true }
    )

    if (updateError) {
      console.error('Error updating auth email:', updateError)
      throw new Error(updateError.message)
    }

    // Atualizar também na tabela profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ email: newEmail })
      .eq('user_id', userId)

    if (profileError) {
      console.error('Error updating profile email:', profileError)
    }

    console.log('Email updated successfully')

    return new Response(
      JSON.stringify({ success: true, message: 'Email alterado com sucesso' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('Error in update-user-email:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
}

export default handler;
if (import.meta.main) Deno.serve(handler);
