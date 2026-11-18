import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Redirect URI cadastrado no app do Bling. Recebe ?code&state, valida o state assinado
// pelo bling-auth-start, troca o code por tokens e grava em bling_connections.
// Deploy com verify_jwt=false: quem chama é o navegador vindo do Bling, sem sessão.
// Responde sempre com 302 de volta ao app (o gateway do Supabase reescreve HTML para text/plain).

const fromB64url = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function readState(state: string, secret: string): Promise<{ t: string; o: string; e: number }> {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) throw new Error('state inválido')
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), new TextEncoder().encode(payload))
  if (!ok) throw new Error('state inválido')
  const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)))
  if (!data.t || !data.o || Date.now() > data.e) throw new Error('state expirado, tente conectar de novo')
  return data
}

const back = (origin: string, status: 'ok' | 'erro', msg?: string) => {
  const u = new URL('/configuracoes', origin)
  u.searchParams.set('bling', status)
  if (msg) u.searchParams.set('msg', msg.slice(0, 120))
  return new Response(null, { status: 302, headers: { Location: u.toString() } })
}

serve(async (req) => {
  const url = new URL(req.url)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  let origin = ''

  try {
    const code = url.searchParams.get('code')
    const stateParam = url.searchParams.get('state')
    if (!stateParam) throw new Error('state ausente')
    const state = await readState(stateParam, serviceRoleKey)
    origin = state.o

    if (url.searchParams.get('error')) throw new Error('Autorização negada no Bling')
    if (!code) throw new Error('code ausente')

    const clientId = Deno.env.get('BLING_CLIENT_ID')
    const clientSecret = Deno.env.get('BLING_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('credenciais do Bling não configuradas')

    const res = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '1.0',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
    })
    const tokens = await res.json().catch(() => ({}))
    if (!res.ok || !tokens.access_token) {
      console.error('bling token error', res.status, JSON.stringify(tokens))
      throw new Error('o Bling recusou o código de autorização')
    }

    const now = Date.now()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
    const { error } = await admin.from('bling_connections').upsert({
      tenant_user_id: state.t,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_expires_at: new Date(now + (tokens.expires_in ?? 21600) * 1000).toISOString(),
      refresh_expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      connected_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    if (error) throw error

    return back(origin, 'ok')
  } catch (e) {
    console.error('bling-callback', (e as Error).message)
    // Sem origem confiável (state inválido) não há para onde voltar com segurança.
    if (!origin) return new Response('Falha ao conectar com o Bling.', { status: 400 })
    return back(origin, 'erro', (e as Error).message)
  }
})
