-- Avaliacao Google via WhatsApp - 7 funcoes (US-002)
-- Plano: .omc/plans/avaliacao-google-whatsapp.md (Passo 3 + "Melhorias aceitas na aprovacao final")
-- Migration ADITIVA: so create function. Nenhuma funcao altera service_orders, customers ou status_history.
-- Aplicada no projeto dldudynonsmcutjwpgvy via MCP apply_migration com o nome
-- "avaliacao_google_whatsapp_funcoes". Esta copia e so registro.
-- Todas SECURITY INVOKER, search_path = public, EXECUTE so para service_role.

-- 3.1 Telefone: so digitos; 11 -> 55+numero; 13 comecando com 55 -> igual; resto (10, 12, vazio...) -> null.
create or replace function public.avaliacao_telefone(p_texto text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select case
           when d ~ '^[0-9]{11}$' then '55' || d
           when d ~ '^55[0-9]{11}$' then d
           else null
         end
  from (select regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g') as d) x
$$;

-- 3.2 Candidatos: fonte unica da regra. motivos = TODAS as regras que bateram (vazio = pode receber).
-- p_desde substitui data_inicio. Cortes (menos_de_24h, passou_7_dias) sempre por ultimo.
create or replace function public.avaliacao_candidatos(p_desde timestamptz)
returns table (
  service_order_id uuid,
  os_number int,
  customer_id uuid,
  nome text,
  primeiro_nome text,
  equipamento text,
  telefone_normalizado text,
  entregue_em timestamptz,
  motivos text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select * from avaliacao_config where id = 1
  ),
  hist_entregue as (
    select h.service_order_id as os_id, max(h.created_at) as em
    from status_history h
    where h.status = 'entregue'
    group by h.service_order_id
  ),
  base as (
    select
      so.id,
      so.os_number,
      so.customer_id,
      so.user_id,
      so.status,
      so.payment_status,
      so.entry_date,
      so.created_at,
      so.equipment,
      coalesce(nullif(btrim(c.name), ''), nullif(btrim(so.guest_name), '')) as nome,
      avaliacao_telefone(coalesce(nullif(btrim(c.phone), ''), so.guest_phone)) as tel,
      -- ultima entrega (mais recente linha 'entregue' do historico)
      coalesce(he.em, case when so.status = 'entregue' then so.status_changed_at end) as entregue_hist,
      -- data de referencia (saida): entregue -> ultima entrega; cancelado/devolucao -> mudanca de status
      case
        when so.status = 'entregue' then coalesce(he.em, so.status_changed_at)
        when so.status in ('cancelado', 'devolucao') then so.status_changed_at
        else he.em
      end as data_ref,
      lower(translate(
        concat_ws(' ', so.problem_description, so.internal_notes, so.technician_observation, so.problem_resolution),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      )) as texto
    from service_orders so
    left join customers c on c.id = so.customer_id
    left join hist_entregue he on he.os_id = so.id
  )
  select
    b.id,
    b.os_number,
    b.customer_id,
    b.nome,
    initcap(split_part(b.nome, ' ', 1)),
    b.equipment,
    b.tel,
    b.data_ref,
    array_remove(array[
      case when b.user_id is distinct from cfg.tenant_user_id then 'outro_tenant' end,
      case when b.status is distinct from 'entregue' then 'status_' || coalesce(b.status, 'nulo') end,
      case when b.data_ref < p_desde then 'antes_data_inicio' end,
      case when b.payment_status is distinct from 'pago' then 'pagamento_' || coalesce(b.payment_status, 'nulo') end,
      case when not exists (select 1 from service_order_services s where s.service_order_id = b.id)
            and not exists (select 1 from service_order_items i where i.service_order_id = b.id)
           then 'sem_servico_ou_item' end,
      case when b.nome is null then 'sem_nome' end,
      case when b.tel is null then 'telefone_invalido' end,
      -- (a) outra OS entregue do mesmo cliente ou telefone nos N dias antes da entrada desta
      case when exists (
        select 1 from base o
        where o.id <> b.id
          and (o.customer_id = b.customer_id or o.tel = b.tel)
          and o.entregue_hist is not null
          and (o.entregue_hist at time zone 'America/Sao_Paulo')::date
              between b.entry_date - cfg.dias_retorno_garantia and b.entry_date
      ) then 'garantia_cliente_anterior' end,
      -- (b) mesmo cliente ou telefone abriu OS nova depois desta entrega
      case when exists (
        select 1 from base o
        where o.id <> b.id
          and (o.customer_id = b.customer_id or o.tel = b.tel)
          and o.created_at > b.data_ref
      ) then 'garantia_voltou_depois' end,
      -- (c) palavra-chave nos 4 campos de texto (sem acento/maiuscula)
      case when b.texto ~ '(garantia|retrabalho|retorno|voltou)' then 'garantia_palavra' end,
      case when b.tel is not null and exists (
        select 1 from avaliacao_pedidos p
        where p.telefone_normalizado = b.tel
          and (p.status in ('pendente', 'falha_sem_envio', 'enviado', 'incerto') or p.motivo = 'opt_out')
          and p.service_order_id is distinct from b.id
      ) then 'telefone_ja_recebeu' end,
      case when exists (
        select 1 from avaliacao_pedidos p
        where p.service_order_id = b.id and p.status <> 'falha_sem_envio'
      ) then 'os_ja_registrada' end,
      case when cfg.modo = 'piloto' and (
        b.tel is null
        or not exists (select 1 from unnest(cfg.telefones_piloto) tp where avaliacao_telefone(tp) = b.tel)
      ) then 'fora_piloto' end,
      -- cortes por ultimo (usam sempre now())
      case when b.data_ref > now() - interval '24 hours' then 'menos_de_24h' end,
      case when b.data_ref < now() - interval '7 days' then 'passou_7_dias' end
    ]::text[], null)
  from base b
  cross join cfg
  where b.data_ref is not null
    and b.data_ref >= least(p_desde, now() - interval '8 days')
$$;

-- Texto aprovado da mensagem (montado no banco).
-- Usado dentro de avaliacao_reservar_proximo.

-- 3.3 Reserva o proximo pedido (0 ou 1 linha). Chamada em laco pelo n8n.
create or replace function public.avaliacao_reservar_proximo(p_agora timestamptz default now())
returns table (
  pedido_id bigint,
  service_order_id uuid,
  os_number int,
  primeiro_nome text,
  equipamento text,
  telefone_normalizado text,
  mensagem text,
  tentativa int
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cfg avaliacao_config%rowtype;
  v_local timestamp;
  v_r avaliacao_pedidos%rowtype;
  v_c record;
  v_achou boolean;
  v_motivo text;
  v_id bigint;
  v_tent int;
  v_texto constant text :=
    'Olá, %s! Aqui é a Dantas Info. Tudo certo com o seu %s? Se você ficou satisfeito com o atendimento, '
    'ajuda muito a gente se você deixar uma avaliação rápida no Google (leva 1 minuto): %s. Obrigado pela confiança!';
begin
  -- 1. desligado ou simulacao
  select * into v_cfg from avaliacao_config where id = 1;
  if not found or not v_cfg.ativo or v_cfg.modo = 'simulacao' then
    return;
  end if;

  -- 2. sem link
  if coalesce(btrim(v_cfg.link_google), '') = '' then
    return;
  end if;

  -- 3. janela: seg-sab, 10:00 <= hora < 17:55 em Sao Paulo, fora de business_closures
  v_local := p_agora at time zone 'America/Sao_Paulo';
  if extract(isodow from v_local) = 7
     or v_local::time < time '10:00'
     or v_local::time >= time '17:55' then
    return;
  end if;
  if exists (
    select 1 from business_closures bc
    where v_local::date between bc.start_date and bc.end_date
  ) then
    return;
  end if;

  -- 4. disjuntor: erro de configuracao pausa a reserva
  if exists (
    select 1 from avaliacao_pedidos p
    where p.status = 'falha_sem_envio' and p.motivo like 'config\_%'
  ) then
    return;
  end if;

  -- 5. limite por execucao (janela de 25 min)
  if (select count(*) from avaliacao_pedidos p where p.reservado_em > now() - interval '25 minutes')
     >= v_cfg.limite_por_execucao then
    return;
  end if;

  -- 6. so em modo real: registra ignorado/passou_7_dias para quem passaria em tudo menos no corte
  if v_cfg.modo = 'real' then
    insert into avaliacao_pedidos (
      service_order_id, customer_id, os_number, nome, equipamento,
      telefone_normalizado, entregue_em, status, motivo, modo
    )
    select c.service_order_id, c.customer_id, c.os_number, c.nome, c.equipamento,
           c.telefone_normalizado, c.entregue_em, 'ignorado', 'passou_7_dias', 'real'
    from avaliacao_candidatos(v_cfg.data_inicio) c
    where c.motivos = array['passou_7_dias']::text[]
    on conflict do nothing;
  end if;

  -- 7. nova tentativa de falha certa (mais antiga primeiro), reavaliando as regras
  for v_r in
    select p.* from avaliacao_pedidos p
    where p.status = 'falha_sem_envio'
      and p.tentativas < 2
      and (p.motivo is null or p.motivo not like 'config\_%')
    order by coalesce(p.reservado_em, p.criado_em), p.id
    for update skip locked
  loop
    v_motivo := null;
    v_achou := false;
    if v_r.service_order_id is not null then
      select * into v_c from avaliacao_candidatos(v_cfg.data_inicio) c
      where c.service_order_id = v_r.service_order_id;
      v_achou := found;
    end if;

    if v_r.service_order_id is null then
      v_motivo := 'os_apagada';
    elsif not v_achou then
      v_motivo := 'nao_elegivel';
    elsif v_c.motivos = '{}'::text[] then
      if v_c.telefone_normalizado is distinct from v_r.telefone_normalizado then
        v_motivo := 'telefone_mudou';
      else
        update avaliacao_pedidos p
           set status = 'pendente',
               motivo = null,
               tentativas = p.tentativas + 1,
               reservado_em = now(),
               atualizado_em = now(),
               alertado_em = null,
               nome = v_c.nome,
               equipamento = v_c.equipamento
         where p.id = v_r.id
           and p.status = 'falha_sem_envio'
           and p.tentativas < 2
           and (p.motivo is null or p.motivo not like 'config\_%')
        returning p.id, p.tentativas into v_id, v_tent;
        if found then
          return query select v_id, v_c.service_order_id, v_c.os_number, v_c.primeiro_nome, v_c.equipamento,
                              v_c.telefone_normalizado,
                              format(v_texto, v_c.primeiro_nome, v_c.equipamento, btrim(v_cfg.link_google)),
                              v_tent;
          return;
        end if;
        continue;  -- outra execucao pegou: segue
      end if;
    elsif v_c.motivos = array['menos_de_24h']::text[] then
      continue;    -- ainda nao e hora; deixa como esta
    elsif v_c.motivos = array['passou_7_dias']::text[] and v_cfg.modo <> 'real' then
      -- ignorado/passou_7_dias so existe em modo real; fora dele vira erro (avisa o dono, nao trava o telefone)
      update avaliacao_pedidos p
         set status = 'erro', motivo = 'passou_7_dias', atualizado_em = now(), alertado_em = null
       where p.id = v_r.id and p.status = 'falha_sem_envio';
      continue;
    else
      v_motivo := v_c.motivos[1];
    end if;

    update avaliacao_pedidos p
       set status = 'ignorado', motivo = v_motivo, atualizado_em = now(), alertado_em = null
     where p.id = v_r.id and p.status = 'falha_sem_envio';
  end loop;

  -- 8. novo pedido: 1 candidato com motivos vazio; reserva com ON CONFLICT DO NOTHING
  for v_c in
    select * from avaliacao_candidatos(v_cfg.data_inicio) c
    where c.motivos = '{}'::text[]
    order by c.entregue_em, c.os_number desc
  loop
    v_id := null;
    insert into avaliacao_pedidos (
      service_order_id, customer_id, os_number, nome, equipamento,
      telefone_normalizado, entregue_em, status, tentativas, modo, reservado_em, atualizado_em
    ) values (
      v_c.service_order_id, v_c.customer_id, v_c.os_number, v_c.nome, v_c.equipamento,
      v_c.telefone_normalizado, v_c.entregue_em, 'pendente', 1, v_cfg.modo, now(), now()
    )
    on conflict do nothing
    returning id into v_id;

    if v_id is not null then
      -- 9. mensagem com o texto aprovado
      return query select v_id, v_c.service_order_id, v_c.os_number, v_c.primeiro_nome, v_c.equipamento,
                          v_c.telefone_normalizado,
                          format(v_texto, v_c.primeiro_nome, v_c.equipamento, btrim(v_cfg.link_google)),
                          1;
      return;
    end if;
  end loop;

  return;
end;
$$;

-- 3.4 Porta unica de escrita num pedido (n8n e dono).
-- p_atualizado_em_lido: obrigatorio em 'avisado' (so marca se o pedido nao mudou desde a leitura).
-- p_telefone: usado em 'opt_out' sem pedido (p_pedido_id null).
create or replace function public.avaliacao_registrar(
  p_pedido_id bigint,
  p_acao text,
  p_motivo text default null,
  p_message_id text default null,
  p_atualizado_em_lido timestamptz default null,
  p_telefone text default null
)
returns public.avaliacao_pedidos
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v avaliacao_pedidos%rowtype;
  v_out avaliacao_pedidos%rowtype;
  v_tel text;
  v_preso boolean;
  v_trava_id bigint;
begin
  if p_acao is null or p_acao not in (
    'enviado', 'falha_sem_envio', 'incerto', 'ignorado', 'enviado_manual',
    'tentar_de_novo', 'opt_out', 'avisado', 'resposta_avisada'
  ) then
    raise exception 'avaliacao_registrar: acao invalida: %', coalesce(p_acao, '(nula)');
  end if;

  -- opt_out: por telefone (do pedido ou digitado), normalizado
  if p_acao = 'opt_out' then
    if p_pedido_id is not null then
      select * into v from avaliacao_pedidos where id = p_pedido_id for update;
      if not found then
        raise exception 'avaliacao_registrar: pedido % nao existe', p_pedido_id;
      end if;
      v_tel := v.telefone_normalizado;
    else
      v_tel := avaliacao_telefone(p_telefone);
    end if;
    if v_tel is null then
      raise exception 'avaliacao_registrar: opt_out com telefone invalido: %', coalesce(p_telefone, '(vazio)');
    end if;

    -- linha que trava este telefone (no maximo 1 pelo indice parcial)
    select * into v from avaliacao_pedidos p
    where p.telefone_normalizado = v_tel
      and (p.status in ('pendente', 'falha_sem_envio', 'enviado', 'incerto') or p.motivo = 'opt_out')
    for update;

    if found then
      if v.status = 'enviado' or v.motivo = 'opt_out' then
        return v;  -- ja bloqueado para sempre
      end if;
      -- pendente / falha_sem_envio (inclusive pausa config_) / incerto -> opt_out (para a nova tentativa)
      update avaliacao_pedidos
         set status = 'ignorado', motivo = 'opt_out', atualizado_em = now(), alertado_em = null
       where id = v.id
      returning * into v_out;
      return v_out;
    end if;

    insert into avaliacao_pedidos (telefone_normalizado, status, motivo, modo)
    values (v_tel, 'ignorado', 'opt_out', 'real')
    returning * into v_out;
    return v_out;
  end if;

  select * into v from avaliacao_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'avaliacao_registrar: pedido % nao existe', p_pedido_id;
  end if;

  v_preso := v.status = 'pendente' and v.reservado_em < now() - interval '2 hours';

  if p_acao = 'avisado' then
    if p_atualizado_em_lido is null then
      raise exception 'avaliacao_registrar: avisado exige p_atualizado_em_lido (atualizado_em lido em avaliacao_avisos)';
    end if;
    if v.atualizado_em is distinct from p_atualizado_em_lido then
      return v;  -- pedido mudou desde a leitura: nao marca (o aviso novo sai na proxima execucao)
    end if;
    update avaliacao_pedidos set alertado_em = now() where id = v.id returning * into v_out;
    return v_out;
  end if;

  if p_acao = 'resposta_avisada' then
    if v.status <> 'enviado' then
      raise exception 'avaliacao_registrar: transicao nao prevista: % a partir de %', p_acao, v.status;
    end if;
    update avaliacao_pedidos set resposta_alertada_em = now() where id = v.id returning * into v_out;
    return v_out;
  end if;

  if p_acao in ('enviado', 'falha_sem_envio', 'incerto', 'ignorado') and v.status <> 'pendente' then
    raise exception 'avaliacao_registrar: transicao nao prevista: % a partir de %', p_acao, v.status;
  end if;

  if p_acao = 'enviado' then
    update avaliacao_pedidos
       set status = 'enviado', enviado_em = now(), evolution_message_id = p_message_id,
           atualizado_em = now(), alertado_em = null
     where id = v.id returning * into v_out;
    return v_out;
  end if;

  if p_acao = 'falha_sem_envio' then
    if p_motivo like 'config\_%' then
      update avaliacao_pedidos
         set status = 'falha_sem_envio', motivo = p_motivo, atualizado_em = now(), alertado_em = null
       where id = v.id returning * into v_out;
    elsif v.tentativas >= 2 then
      update avaliacao_pedidos
         set status = 'erro', motivo = p_motivo, atualizado_em = now(), alertado_em = null
       where id = v.id returning * into v_out;
    else
      update avaliacao_pedidos
         set status = 'falha_sem_envio', motivo = p_motivo, atualizado_em = now(), alertado_em = null
       where id = v.id returning * into v_out;
    end if;
    return v_out;
  end if;

  if p_acao = 'incerto' then
    update avaliacao_pedidos
       set status = 'incerto', motivo = p_motivo, atualizado_em = now(), alertado_em = null
     where id = v.id returning * into v_out;
    return v_out;
  end if;

  if p_acao = 'ignorado' then
    if coalesce(btrim(p_motivo), '') = '' or p_motivo in ('opt_out', 'manual') then
      raise exception 'avaliacao_registrar: ignorado exige motivo (ex.: sem_whatsapp); para opt-out use a acao opt_out';
    end if;
    update avaliacao_pedidos
       set status = 'ignorado', motivo = p_motivo, atualizado_em = now(), alertado_em = null
     where id = v.id returning * into v_out;
    return v_out;
  end if;

  -- acoes do dono que passam a travar o telefone: conferir se outro pedido ja trava
  if p_acao = 'enviado_manual' then
    if not (v.status in ('incerto', 'erro', 'falha_sem_envio')
            or (v.status = 'ignorado' and v.motivo is distinct from 'opt_out')
            or v_preso) then
      raise exception 'avaliacao_registrar: transicao nao prevista: % a partir de %/%', p_acao, v.status, coalesce(v.motivo, '-');
    end if;
  elsif p_acao = 'tentar_de_novo' then
    if not (v.status in ('incerto', 'erro', 'falha_sem_envio') or v_preso) then
      raise exception 'avaliacao_registrar: transicao nao prevista: % a partir de %/%', p_acao, v.status, coalesce(v.motivo, '-');
    end if;
  end if;

  select p.id into v_trava_id from avaliacao_pedidos p
  where p.telefone_normalizado = v.telefone_normalizado
    and p.id <> v.id
    and (p.status in ('pendente', 'falha_sem_envio', 'enviado', 'incerto') or p.motivo = 'opt_out')
  limit 1;
  if v_trava_id is not null then
    raise exception 'avaliacao_registrar: o telefone % ja esta travado pelo pedido % (enviado, em andamento ou opt-out). Nada foi alterado.',
      v.telefone_normalizado, v_trava_id;
  end if;

  begin
    if p_acao = 'enviado_manual' then
      update avaliacao_pedidos
         set status = 'enviado', motivo = 'manual', enviado_em = now(), atualizado_em = now(), alertado_em = null
       where id = v.id returning * into v_out;
    else
      update avaliacao_pedidos
         set status = 'falha_sem_envio', motivo = null, tentativas = 1, atualizado_em = now(), alertado_em = null
       where id = v.id returning * into v_out;
    end if;
  exception when unique_violation then
    raise exception 'avaliacao_registrar: o telefone % ja esta travado por outro pedido (enviado, em andamento ou opt-out). Nada foi alterado.',
      v.telefone_normalizado;
  end;
  return v_out;
end;
$$;

-- 3.5 Avisos ao dono (so leitura, exceto sem_link que se marca na propria chamada).
create or replace function public.avaliacao_avisos(p_agora timestamptz default now())
returns table (
  tipo text,
  pedido_id bigint,
  os_number int,
  nome text,
  telefone_normalizado text,
  enviado_em timestamptz,
  detalhe text,
  atualizado_em timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cfg avaliacao_config%rowtype;
begin
  return query
  select
    case
      when p.status = 'pendente' then 'preso'
      when p.status = 'incerto' then 'incerto'
      when p.status = 'erro' then 'erro'
      when p.status = 'falha_sem_envio' then 'pausado'
      else 'expirado'
    end,
    p.id, p.os_number, p.nome, p.telefone_normalizado, p.enviado_em,
    case
      when p.status = 'pendente' then format(
        'OS %s de %s: envio travado em andamento há mais de 2 h (não reenvia sozinho). Se saiu: select avaliacao_registrar(%s,''enviado_manual''); se não saiu: select avaliacao_registrar(%s,''tentar_de_novo'').',
        coalesce(p.os_number::text, '?'), coalesce(p.nome, '?'), p.id, p.id)
      when p.status = 'incerto' then format(
        'OS %s de %s: pode ter saído (%s). Não reenvia sozinho. Se saiu: select avaliacao_registrar(%s,''enviado_manual''); se não saiu: select avaliacao_registrar(%s,''tentar_de_novo'').',
        coalesce(p.os_number::text, '?'), coalesce(p.nome, '?'), coalesce(p.motivo, 'sem detalhe'), p.id, p.id)
      when p.status = 'erro' then format(
        'OS %s de %s: falhou de novo (%s), não foi enviado. Para tentar mais 1 vez: select avaliacao_registrar(%s,''tentar_de_novo''); se mandar à mão: select avaliacao_registrar(%s,''enviado_manual'').',
        coalesce(p.os_number::text, '?'), coalesce(p.nome, '?'), coalesce(p.motivo, 'sem detalhe'), p.id, p.id)
      when p.status = 'falha_sem_envio' then format(
        'Envio pausado: %s. Reconecte a Evolution e rode select avaliacao_registrar(%s,''tentar_de_novo'').',
        p.motivo, p.id)
      else format(
        'OS %s de %s não recebeu (passou 7 dias). Se mandar à mão, rode select avaliacao_registrar(%s,''enviado_manual'').',
        coalesce(p.os_number::text, '?'), coalesce(p.nome, '?'), p.id)
    end,
    p.atualizado_em
  from avaliacao_pedidos p
  where (
          p.alertado_em is null
          and (
            (p.status = 'pendente' and p.reservado_em < now() - interval '2 hours')
            or p.status in ('incerto', 'erro')
            or (p.status = 'ignorado' and p.motivo = 'passou_7_dias')
          )
        )
     or (
          -- pausa por configuracao: repete 1 vez por dia enquanto existir
          p.status = 'falha_sem_envio' and p.motivo like 'config\_%'
          and (p.alertado_em is null or p.alertado_em < now() - interval '24 hours')
        )
  order by p.id;

  -- sem link em piloto/real: 1 vez a cada 24 h (marcado aqui mesmo)
  select * into v_cfg from avaliacao_config where id = 1 for update;
  if found and v_cfg.ativo and v_cfg.modo in ('piloto', 'real')
     and coalesce(btrim(v_cfg.link_google), '') = ''
     and (v_cfg.alerta_sem_link_em is null or v_cfg.alerta_sem_link_em < now() - interval '24 hours') then
    update avaliacao_config set alerta_sem_link_em = now() where id = 1;
    return query select 'sem_link'::text, null::bigint, null::int, null::text, null::text, null::timestamptz,
      format('Avaliação Google ligada em modo %s, mas sem link_google: nada está sendo enviado. Preencha avaliacao_config.link_google.', v_cfg.modo),
      null::timestamptz;
  end if;

  -- checar_resposta (nao e aviso): enviados nas ultimas 48 h sem resposta encaminhada
  return query
  select 'checar_resposta'::text, p.id, p.os_number, p.nome, p.telefone_normalizado, p.enviado_em,
         'Consultar findMessages deste telefone depois de enviado_em'::text, p.atualizado_em
  from avaliacao_pedidos p
  where p.status = 'enviado'
    and p.enviado_em > now() - interval '48 hours'
    and p.resposta_alertada_em is null
  order by p.id;
end;
$$;

-- 3.6 Simulacao: ignora janela, limite e cortes. p_desde substitui data_inicio.
-- p_resumo_diario=true: no maximo 1 resumo por dia, so se ativo e modo=simulacao.
create or replace function public.avaliacao_simular(
  p_desde timestamptz default now() - interval '30 days',
  p_resumo_diario boolean default false
)
returns table (
  os_number int,
  primeiro_nome text,
  equipamento text,
  entregue_em timestamptz,
  incluiria boolean,
  motivos text[]
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_cfg avaliacao_config%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_resumo_diario then
    select * into v_cfg from avaliacao_config where id = 1 for update;
    if not found or not v_cfg.ativo or v_cfg.modo <> 'simulacao'
       or v_cfg.ultimo_resumo_simulacao is not distinct from v_hoje then
      return;
    end if;
    update avaliacao_config set ultimo_resumo_simulacao = v_hoje where id = 1;
  end if;

  return query
  select c.os_number, c.primeiro_nome, c.equipamento, c.entregue_em,
         coalesce(array_length(array_remove(array_remove(c.motivos, 'menos_de_24h'), 'passou_7_dias'), 1), 0) = 0,
         c.motivos
  from avaliacao_candidatos(p_desde) c
  order by c.entregue_em, c.os_number;
end;
$$;

-- 3.7 Resumo mensal (mes em Sao Paulo) + retencao de 12 meses de nome/equipamento.
create or replace function public.avaliacao_resumo_mensal(p_mes date)
returns table (
  enviados bigint,
  erros bigint,
  incertos bigint,
  ignorados bigint,
  expirados bigint
)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_ini timestamptz := (date_trunc('month', p_mes)::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := ((date_trunc('month', p_mes) + interval '1 month')::timestamp) at time zone 'America/Sao_Paulo';
begin
  update avaliacao_pedidos
     set nome = null, equipamento = null
   where criado_em < now() - interval '12 months'
     and (nome is not null or equipamento is not null);

  return query
  select
    count(*) filter (where p.status = 'enviado' and p.enviado_em >= v_ini and p.enviado_em < v_fim),
    count(*) filter (where p.status = 'erro' and p.atualizado_em >= v_ini and p.atualizado_em < v_fim),
    count(*) filter (where p.status = 'incerto' and p.atualizado_em >= v_ini and p.atualizado_em < v_fim),
    count(*) filter (where p.status = 'ignorado' and p.motivo is distinct from 'passou_7_dias'
                     and p.atualizado_em >= v_ini and p.atualizado_em < v_fim),
    count(*) filter (where p.status = 'ignorado' and p.motivo = 'passou_7_dias'
                     and p.atualizado_em >= v_ini and p.atualizado_em < v_fim)
  from avaliacao_pedidos p;
end;
$$;

-- Permissoes: so service_role executa.
revoke execute on function public.avaliacao_telefone(text) from public, anon, authenticated;
revoke execute on function public.avaliacao_candidatos(timestamptz) from public, anon, authenticated;
revoke execute on function public.avaliacao_reservar_proximo(timestamptz) from public, anon, authenticated;
revoke execute on function public.avaliacao_registrar(bigint, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.avaliacao_avisos(timestamptz) from public, anon, authenticated;
revoke execute on function public.avaliacao_simular(timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.avaliacao_resumo_mensal(date) from public, anon, authenticated;

grant execute on function public.avaliacao_telefone(text) to service_role;
grant execute on function public.avaliacao_candidatos(timestamptz) to service_role;
grant execute on function public.avaliacao_reservar_proximo(timestamptz) to service_role;
grant execute on function public.avaliacao_registrar(bigint, text, text, text, timestamptz, text) to service_role;
grant execute on function public.avaliacao_avisos(timestamptz) to service_role;
grant execute on function public.avaliacao_simular(timestamptz, boolean) to service_role;
grant execute on function public.avaliacao_resumo_mensal(date) to service_role;
