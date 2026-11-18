import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Inicia o OAuth2 do Bling para a assistência do usuário logado.
// Devolve { url } para o navegador redirecionar o usuário à tela de autorização do Bling.
// O `state` é assinado (HMAC) e carrega o tenant + origem do app, para o bling-callback
// saber a quem pertencem os tokens sem depender de sessão (o callback é um redirect do Bling).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64url(new Uint8Array(sig))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autenticado')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const clientId = Deno.env.get('BLING_CLIENT_ID')
    if (!clientId) throw new Error('BLING_CLIENT_ID não configurado')

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) throw new Error('Não autenticado')

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: membership } = await adminClient
      .from('team_members').select('owner_id').eq('member_user_id', user.id).maybeSingle()
    if (membership) throw new Error('Apenas o dono da conta pode conectar o Bling')
    const tenantId = user.id

    const { returnTo } = await req.json().catch(() => ({ returnTo: '' }))
    const origin = new URL(String(returnTo)).origin // lança se inválido

    const payload = b64url(new TextEncoder().encode(JSON.stringify({
      t: tenantId,
      o: origin,
      e: Date.now() + 10 * 60 * 1000, // state vale 10 min
    })))
    const state = `${payload}.${await sign(payload, serviceRoleKey)}`

    const url = new URL('https://www.bling.com.br/Api/v3/oauth/authorize')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('state', state)

    return new Response(JSON.stringify({ url: url.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
