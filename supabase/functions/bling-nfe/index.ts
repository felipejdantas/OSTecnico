import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Emite (action 'emit') ou atualiza a situação (action 'status') de uma NF-e de PRODUTOS no Bling para uma OS.
// Fluxo: POST /nfe (cria pendente) -> POST /nfe/{id}/enviar (transmite à SEFAZ) -> GET /nfe/{id} (situação, DANFE).
// ATENÇÃO: toda emissão é nota fiscal real. O cancelamento de NF-e não existe na API do Bling: fazer pelo Bling.
// Não lançamos estoque nem contas no Bling (o estoque e o financeiro vivem no OSDANTAS).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BLING = 'https://api.bling.com.br/Api/v3'
const COMPANY_UF = 'PE'
// Naturezas de operação já cadastradas no Bling da Dantas Info
const NATUREZA_PF = 15105093353 // VENDA DE MERCADORIA PARA NÃO CONTRIBUINTE PF
const NATUREZA_PJ = 15105093619 // VENDA DE MERCADORIA PARA PJ

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
const formatNcm = (d: string) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` // 85044010 -> 8504.40.10

// Bling NF-e: 1 pendente, 2 cancelada, 3 aguardando recibo, 4 rejeitada, 5 autorizada, 6 emitida DANFE,
// 7 registrada, 8 aguardando protocolo, 9 denegada, 10 consulta situação, 11 bloqueada
function statusFromSituacao(s: number): 'emitida' | 'cancelada' | 'erro' | 'enviada' {
  if (s === 5 || s === 6 || s === 7) return 'emitida'
  if (s === 2) return 'cancelada'
  if (s === 4 || s === 9 || s === 11) return 'erro'
  return 'enviada'
}

async function syncFromBling(admin: SupabaseClient, token: string, emissionId: string, blingId: number) {
  const r = await bling(token, 'GET', `/nfe/${blingId}`)
  if (!r.ok) return null
  const d = r.data?.data ?? {}
  const status = statusFromSituacao(Number(d.situacao))
  const patch = {
    numero: d.numero ? String(d.numero).replace(/^0+/, '') || String(d.numero) : null,
    link: absLink(d.linkPDF || d.linkDanfe),
    status,
    error: status === 'erro'
      ? (Number(d.situacao) === 4 ? 'NF-e rejeitada pela SEFAZ. Abra a nota no Bling para ver o motivo e corrigir.' : 'NF-e denegada ou bloqueada. Veja os detalhes no Bling.')
      : null,
    updated_at: new Date().toISOString(),
  }
  await admin.from('nfe_emissions').update(patch).eq('id', emissionId)
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
      const { data: em } = await admin.from('nfe_emissions').select('*')
        .eq('service_order_id', os.id).not('bling_nfe_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!em) throw new UserError('Nenhuma NF-e encontrada para esta OS')
      const patch = await syncFromBling(admin, token, em.id, em.bling_nfe_id)
      return json({ success: true, emission: { ...em, ...(patch ?? {}) } })
    }

    if (action !== 'emit') throw new UserError('Ação inválida')

    // Mesma regra de canEmitNfse() no front: só com o serviço concluído.
    if (os.status !== 'pronto' && os.status !== 'entregue') {
      throw new UserError('Só é possível emitir NF-e com a OS em "Pronto para Retirada" ou "Entregue".')
    }

    // ---- Tomador (revisado pelo usuário no painel)
    const c = body.customer ?? {}
    const doc = digits(c.document)
    if (doc.length !== 11 && doc.length !== 14) throw new UserError('CPF/CNPJ do destinatário inválido')
    const name = String(c.name ?? '').trim()
    if (!name) throw new UserError('Nome do destinatário é obrigatório')
    const uf = String(c.uf ?? '').trim().toUpperCase()
    const city = String(c.city ?? '').trim()
    const neighborhood = String(c.neighborhood ?? '').trim()
    const street = String(c.address ?? '').trim()
    if (uf.length !== 2 || !city || !neighborhood || !street) throw new UserError('Informe rua, bairro, cidade e UF do destinatário')
    const isCompany = doc.length === 14
    const ie = digits(c.stateRegistration)

    // ---- Itens: quantidade e preço vêm do banco; do painel só o NCM (por id do produto)
    const { data: rows } = await admin.from('service_order_items')
      .select('id, product_id, product_name, quantity, unit_price').eq('service_order_id', os.id)
    const productIds = [...new Set((rows ?? []).map((r: any) => r.product_id).filter(Boolean))]
    const { data: prods } = productIds.length
      ? await admin.from('products').select('id, sku, unit, ncm, origem, cest, gtin, tributos_pct').eq('user_id', tenantId).in('id', productIds)
      : { data: [] as any[] }
    const prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]))
    const ncmOverrides: Record<string, unknown> = body.ncm ?? {}

    // CFOP: venda dentro do estado (5102) ou para outro estado (6102)
    const cfop = uf === COMPANY_UF ? '5102' : '6102'
    const itens = (rows ?? []).map((r: any) => {
      const qty = Number(r.quantity) || 0
      const unit = Number(r.unit_price) || 0
      const p: any = prodMap.get(r.product_id)
      const ncm = digits(ncmOverrides[r.id] ?? p?.ncm)
      if (ncm.length !== 8) throw new UserError(`Informe o NCM (8 dígitos) de "${r.product_name}".`)
      return {
        codigo: String(p?.sku || (r.product_id ?? r.id).slice(0, 8)),
        descricao: String(r.product_name).slice(0, 120),
        unidade: String(p?.unit || 'un').slice(0, 6),
        quantidade: qty,
        valor: round2(unit),
        valorTotal: round2(qty * unit),
        tipo: 'P',
        classificacaoFiscal: formatNcm(ncm),
        origem: Number(p?.origem ?? 0),
        cfop,
        ...(p?.cest ? { cest: String(p.cest) } : {}),
        ...(p?.gtin ? { gtin: String(p.gtin) } : {}),
        // Só envia o bloco de impostos quando há % de tributos aproximados (Lei 12.741); o ICMS vem da natureza.
        ...(Number(p?.tributos_pct) > 0
          ? { impostos: { valorAproximadoTotalTributos: round2((qty * unit * Number(p.tributos_pct)) / 100) } }
          : {}),
      }
    }).filter((i: any) => i.valorTotal > 0)
    if (!itens.length) throw new UserError('A OS não tem produtos com valor para emitir NF-e')
    const subtotal = round2(itens.reduce((a: number, i: any) => a + i.valorTotal, 0))
    const desconto = round2(Math.min(Math.max(Number(body.discount) || 0, 0), subtotal))
    if (desconto >= subtotal) throw new UserError('O desconto não pode zerar o valor da nota')

    // ---- Trava de duplicidade / retomada (só quando a nota foi criada mas o envio falhou)
    const { data: resumable } = await admin.from('nfe_emissions').select('*')
      .eq('service_order_id', os.id).eq('status', 'erro').not('bling_nfe_id', 'is', null)
      .like('error', 'A nota foi criada%')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    let emission = resumable
    if (emission) {
      await admin.from('nfe_emissions').update({ status: 'processando', error: null, updated_at: new Date().toISOString() }).eq('id', emission.id)
    } else {
      const { data: created, error: insErr } = await admin.from('nfe_emissions').insert({
        tenant_user_id: tenantId, service_order_id: os.id, valor: round2(subtotal - desconto), status: 'processando',
      }).select('*').single()
      if (insErr) {
        if ((insErr as any).code === '23505') throw new UserError('Já existe uma NF-e emitida ou em andamento para esta OS')
        throw insErr
      }
      emission = created
    }

    const fail = async (msg: string, blingId?: number | null) => {
      await admin.from('nfe_emissions').update({
        status: 'erro', error: msg.slice(0, 500), updated_at: new Date().toISOString(),
        ...(blingId ? { bling_nfe_id: blingId } : {}),
      }).eq('id', emission!.id)
      throw new UserError(msg)
    }

    let blingId: number | null = emission.bling_nfe_id

    if (!blingId) {
      // 1) Cria a NF-e (pendente)
      const now = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date()) // 2026-11-18 10:30:00
      const nr = await bling(token, 'POST', '/nfe', {
        tipo: 1,
        dataEmissao: now,
        dataOperacao: now,
        finalidade: 1,
        naturezaOperacao: { id: isCompany ? NATUREZA_PJ : NATUREZA_PF },
        contato: {
          nome: name,
          tipoPessoa: isCompany ? 'J' : 'F',
          numeroDocumento: doc,
          contribuinte: isCompany && ie ? 1 : 9,
          ...(isCompany && ie ? { ie } : {}),
          ...(String(c.email ?? '').trim() ? { email: String(c.email).trim() } : {}),
          endereco: {
            endereco: street.slice(0, 100), numero: String(c.number ?? '') || 'S/N', complemento: String(c.complement ?? ''),
            bairro: neighborhood, cep: digits(c.cep), municipio: city, uf,
          },
        },
        itens,
        desconto,
        transporte: { fretePorConta: 9 }, // sem ocorrência de transporte (retirada na loja)
      })
      if (!nr.ok) await fail('Bling recusou a nota: ' + blingError(nr.data, 'erro desconhecido'))
      blingId = nr.data?.data?.id
      await admin.from('nfe_emissions').update({ bling_nfe_id: blingId, updated_at: new Date().toISOString() }).eq('id', emission.id)
    }

    // 2) Transmite à SEFAZ
    const sr = await bling(token, 'POST', `/nfe/${blingId}/enviar`)
    if (!sr.ok) await fail('A nota foi criada no Bling mas o envio falhou: ' + blingError(sr.data, 'erro desconhecido') + ' Tente novamente.', blingId)

    await admin.from('nfe_emissions').update({ status: 'enviada', error: null, updated_at: new Date().toISOString() }).eq('id', emission.id)
    const patch = await syncFromBling(admin, token, emission.id, blingId!)
    return json({ success: true, emission: { ...emission, bling_nfe_id: blingId, status: 'enviada', ...(patch ?? {}) } })
  } catch (error) {
    const isUser = error instanceof UserError
    if (!isUser) console.error('bling-nfe', error)
    return json({ error: isUser ? (error as Error).message : 'Erro inesperado ao emitir a NF-e' }, isUser ? 400 : 500)
  }
})
