import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Não autorizado')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requestingUser) {
      throw new Error('Não autorizado')
    }

    // Check if requesting user is admin
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single()

    if (userRole?.role !== 'admin') {
      throw new Error('Apenas administradores podem redefinir senhas')
    }

    const { userId, newPassword, generateRandom } = await req.json()

    if (!userId) {
      throw new Error('ID do usuário é obrigatório')
    }

    let passwordToUse = newPassword

    // Generate random password if requested
    if (generateRandom || !passwordToUse) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
      passwordToUse = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    }

    if (passwordToUse.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres')
    }

    console.log(`Resetting password for user: ${userId}`)

    // Update user password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: passwordToUse }
    )

    if (updateError) {
      console.error('Error updating password:', updateError)
      throw new Error(updateError.message)
    }

    console.log('Password reset successful')

    return new Response(
      JSON.stringify({ 
        success: true, 
        newPassword: generateRandom ? passwordToUse : undefined,
        message: 'Senha redefinida com sucesso'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('Error in reset-user-password:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
