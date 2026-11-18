import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Emite (action 'emit') ou atualiza a situação (action 'status') de uma NFS-e no Bling para uma OS.
// Fluxo da emissão: contato no Bling (acha por CPF/CNPJ ou cria) -> POST /nfse -> POST /nfse/{id}/enviar.
// ATENÇÃO: não existe homologação de NFS-e na API do Bling, toda emissão é nota fiscal real.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BLING = 'https://api.bling.com.br/Api/v3'
const SERVICE_CODE = '010701' // Suporte técnico em informática (lista de serviço do Bling da Dantas Info)

class UserError extends Error {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function getToken(admin: SupabaseClient, tenantId: string): Promise<string> {
  const { data: row } = await admin.from('bling_connections').select('*').eq('tenant_user_id', tenantId).maybeSingle()
  if (!row) throw new UserError('Bling não conectado. Conecte em Configurações.')
  if (new Date(row.access_expires_at).getTime() - Date.now() > 5 * 60 * 1000) return row.access_token

  if (new Date(row.refresh_expires_at).getTime() < Date.now()) {
    throw new UserError('A conexão com o Bling expirou. Reconecte em Configurações.')
  }
  const id = Deno.env.get('BLING_CLIENT_ID')!
  const secret = Deno.env.get('BLING_CLIENT_SECRET')!
  const res = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token }).toString(),
  })
  const t = await res.json().catch(() => ({}))
  if (!res.ok || !t.access_token) {
    console.error('bling refresh error', res.status, JSON.stringify(t))
    throw new UserError('Não foi possível renovar a conexão com o Bling. Reconecte em Configurações.')
  }
  const now = Date.now()
  await admin.from('bling_connections').update({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    access_expires_at: new Date(now + (t.expires_in ?? 21600) * 1000).toISOString(),
    refresh_expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now).toISOString(),
  }).eq('tenant_user_id', tenantId)
  return t.access_token
}

async function bling(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(BLING + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function blingError(data: any, fallback: string) {
  const e = data?.error
  if (!e) return fallback
  const fields = Array.isArray(e.fields) ? e.fields.map((f: any) => f.message).join(' ') : ''
  return [e.description || e.message, fields].filter(Boolean).join(' ') || fallback
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const round2 = (n: number) => Math.round(n * 100) / 100
const absLink = (l?: string | null) => (l ? (l.startsWith('http') ? l : `https://www.bling.com.br/${l.replace(/^\//, '')}`) : null)

// Bling: 0 pendente, 1 emitida, 2 disponível p/ consulta, 3 cancelada
const statusFromSituacao = (s: number) => (s === 1 ? 'emitida' : s === 3 ? 'cancelada' : 'enviada')

async function syncFromBling(admin: SupabaseClient, token: string, emissionId: string, blingId: number) {
  const r = await bling(token, 'GET', `/nfse/${blingId}`)
  if (!r.ok) return null
  const d = r.data?.data ?? {}
  const patch = {
    numero: d.numero || null,
    link: absLink(d.link),
    status: statusFromSituacao(Number(d.situacao)),
    updated_at: new Date().toISOString(),
  }
  await admin.from('nfse_emissions').update(patch).eq('id', emissionId)
  return patch
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new UserError('Não autenticado')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await callerClient.auth.getUser()
    if (userError || !user) throw new UserError('Não autenticado')

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: membership } = await admin.from('team_members').select('owner_id').eq('member_user_id', user.id).maybeSingle()
    const tenantId: string = membership?.owner_id ?? user.id

    const body = await req.json()
    const { action, serviceOrderId } = body
    if (!serviceOrderId) throw new UserError('OS não informada')

    const { data: os } = await admin.from('service_orders')
      .select('id, os_number, user_id, status').eq('id', serviceOrderId).eq('user_id', tenantId).maybeSingle()
    if (!os) throw new UserError('OS não encontrada')

    const token = await getToken(admin, tenantId)

    // ---- Atualizar situação da nota já enviada
    if (action === 'status') {
      const { data: em } = await admin.from('nfse_emissions').select('*')
        .eq('service_order_id', os.id).not('bling_nfse_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!em) throw new UserError('Nenhuma NFS-e encontrada para esta OS')
      if (em.status === 'cancelada') return json({ success: true, emission: em }) // cancelamento é final
      const patch = await syncFromBling(admin, token, em.id, em.bling_nfse_id)
      return json({ success: true, emission: { ...em, ...(patch ?? {}) } })
    }

    // ---- Cancelar NFS-e (Ambiente Nacional exige motivo + justificativa). Só o dono da conta.
    if (action === 'cancel') {
      if (membership) throw new UserError('Apenas o dono da conta pode cancelar NFS-e')
      const { data: em } = await admin.from('nfse_emissions').select('*')
        .eq('service_order_id', os.id).in('status', ['enviada', 'emitida']).not('bling_nfse_id', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!em) throw new UserError('Não há NFS-e ativa para cancelar nesta OS')
      const motivo = Number(body.codigoMotivo)
      if (![1, 2, 9].includes(motivo)) throw new UserError('Motivo de cancelamento inválido')
      const justificativa = String(body.justificativa ?? '').trim()
      if (justificativa.length < 15) throw new UserError('A justificativa precisa ter pelo menos 15 caracteres')
      const r = await bling(token, 'POST', `/nfse/${em.bling_nfse_id}/cancelar`, {
        codigoMotivo: motivo, justificativa: justificativa.slice(0, 255),
      })
      if (!r.ok) throw new UserError('O Bling recusou o cancelamento: ' + blingError(r.data, 'erro desconhecido'))
      const patch = {
        status: 'cancelada', canceled_at: new Date().toISOString(),
        cancel_reason: `${motivo}: ${justificativa}`.slice(0, 500), updated_at: new Date().toISOString(),
      }
      await admin.from('nfse_emissions').update(patch).eq('id', em.id)
      return json({ success: true, emission: { ...em, ...patch } })
    }

    if (action !== 'emit') throw new UserError('Ação inválida')

    // Mesma regra de canEmitNfse() no front: só com o serviço concluído.
    if (os.status !== 'pronto' && os.status !== 'entregue') {
      throw new UserError('Só é possível emitir NFS-e com a OS em "Pronto para Retirada" ou "Entregue".')
    }

    // ---- Dados da emissão (já revisados pelo usuário no painel)
    const c = body.customer ?? {}
    const doc = digits(c.document)
    if (doc.length !== 11 && doc.length !== 14) throw new UserError('CPF/CNPJ do tomador inválido')
    const name = String(c.name ?? '').trim()
    if (!name) throw new UserError('Nome do tomador é obrigatório')
    const uf = String(c.uf ?? '').trim().toUpperCase()
    const city = String(c.city ?? '').trim()
    const neighborhood = String(c.neighborhood ?? '').trim()
    if (uf.length !== 2 || !city || !neighborhood) throw new UserError('Informe bairro, cidade e UF do tomador')
    const email = String(c.email ?? '').trim()

    // Valores vêm do banco; só o TEXTO da descrição é aceito do painel (indexado pelo id da linha).
    const { data: svc } = await admin.from('service_order_services')
      .select('id, service_name, description, quantity, price').eq('service_order_id', os.id)
    const descriptions: Record<string, unknown> = body.descriptions ?? {}
    const servicos = (svc ?? []).map((s: any) => {
      const qty = Number(s.quantity) || 1
      const typed = String(descriptions[s.id] ?? '').trim()
      const fallback = qty > 1 ? `${s.service_name} (x${qty})` : String(s.service_name)
      return {
        codigo: SERVICE_CODE,
        descricao: (typed || fallback).slice(0, 250),
        valor: round2(qty * Number(s.price || 0)),
      }
    }).filter((s: any) => s.valor > 0)
    if (!servicos.length) throw new UserError('A OS não tem serviços com valor para emitir NFS-e')
    const subtotal = round2(servicos.reduce((a: number, s: any) => a + s.valor, 0))
    const desconto = round2(Math.min(Math.max(Number(body.discount) || 0, 0), subtotal))
    if (desconto >= subtotal) throw new UserError('O desconto não pode zerar o valor da nota')

    // ---- Trava de duplicidade (índice único parcial) / retomada de nota com erro
    const { data: resumable } = await admin.from('nfse_emissions').select('*')
      .eq('service_order_id', os.id).eq('status', 'erro').not('bling_nfse_id', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    let emission = resumable
    if (emission) {
      await admin.from('nfse_emissions').update({ status: 'processando', error: null, updated_at: new Date().toISOString() }).eq('id', emission.id)
    } else {
      const { data: created, error: insErr } = await admin.from('nfse_emissions').insert({
        tenant_user_id: tenantId, service_order_id: os.id, valor: round2(subtotal - desconto), status: 'processando',
      }).select('*').single()
      if (insErr) {
        if ((insErr as any).code === '23505') throw new UserError('Já existe uma NFS-e emitida ou em andamento para esta OS')
        throw insErr
      }
      emission = created
    }

    const fail = async (msg: string, blingId?: number | null) => {
      await admin.from('nfse_emissions').update({
        status: 'erro', error: msg.slice(0, 500), updated_at: new Date().toISOString(),
        ...(blingId ? { bling_nfse_id: blingId } : {}),
      }).eq('id', emission!.id)
      throw new UserError(msg)
    }

    let blingId: number | null = emission.bling_nfse_id

    if (!blingId) {
      // 1) Contato no Bling (acha pelo documento ou cria)
      let contactId: number | null = null
      const found = await bling(token, 'GET', `/contatos?pagina=1&limite=1&numeroDocumento=${doc}`)
      if (found.ok && found.data?.data?.length) contactId = found.data.data[0].id
      const endereco = {
        endereco: String(c.address ?? '').slice(0, 100), numero: String(c.number ?? ''), complemento: String(c.complement ?? ''),
        bairro: neighborhood, cep: digits(c.cep), municipio: city, uf,
      }
      if (!contactId) {
        const cr = await bling(token, 'POST', '/contatos', {
          nome: name, tipo: doc.length === 14 ? 'J' : 'F', numeroDocumento: doc, situacao: 'A',
          ...(email ? { email } : {}), endereco: { geral: endereco },
        })
        if (!cr.ok) await fail('Bling recusou o cadastro do cliente: ' + blingError(cr.data, 'erro desconhecido'))
        contactId = cr.data?.data?.id
      }

      // 2) Cria a nota
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' }).format(new Date())
      const nr = await bling(token, 'POST', '/nfse', {
        data: today,
        contato: { id: contactId, nome: name, numeroDocumento: doc, ...(email ? { email } : {}), endereco },
        servicos,
        desconto,
        reterISS: false,
      })
      if (!nr.ok) await fail('Bling recusou a nota: ' + blingError(nr.data, 'erro desconhecido'))
      blingId = nr.data?.data?.id
      await admin.from('nfse_emissions').update({ bling_nfse_id: blingId, updated_at: new Date().toISOString() }).eq('id', emission.id)
    }

    // 3) Envia para a prefeitura (Ambiente Nacional)
    const sr = await bling(token, 'POST', `/nfse/${blingId}/enviar`)
    if (!sr.ok) await fail('A nota foi criada no Bling mas o envio falhou: ' + blingError(sr.data, 'erro desconhecido') + ' Tente novamente.', blingId)

    await admin.from('nfse_emissions').update({ status: 'enviada', error: null, updated_at: new Date().toISOString() }).eq('id', emission.id)
    const patch = await syncFromBling(admin, token, emission.id, blingId!)
    return json({ success: true, emission: { ...emission, bling_nfse_id: blingId, status: 'enviada', ...(patch ?? {}) } })
  } catch (error) {
    const isUser = error instanceof UserError
    if (!isUser) console.error('bling-nfse', error)
    return json({ error: isUser ? (error as Error).message : 'Erro inesperado ao emitir a NFS-e' }, isUser ? 400 : 500)
  }
})
