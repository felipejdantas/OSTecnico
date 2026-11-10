-- Avaliacao Google via WhatsApp - tabelas (US-001)
-- Plano: .omc/plans/avaliacao-google-whatsapp.md (Passo 2)
-- Migration ADITIVA: so cria tabelas/indice/linha de config. Nao altera tabelas existentes.
-- Aplicada no projeto Supabase do OSDANTAS (dldudynonsmcutjwpgvy) via MCP apply_migration
-- com o nome "avaliacao_google_whatsapp_tabelas". Esta copia e so registro.

create table public.avaliacao_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default false,
  modo text not null default 'simulacao' check (modo in ('simulacao', 'piloto', 'real')),
  link_google text,
  data_inicio timestamptz not null default now(),
  telefones_piloto text[] not null default '{}',
  limite_por_execucao int not null default 5 check (limite_por_execucao >= 0),
  tenant_user_id uuid not null,
  dias_retorno_garantia int not null default 90 check (dias_retorno_garantia >= 0),
  alerta_sem_link_em timestamptz,
  ultimo_resumo_simulacao date
);

comment on table public.avaliacao_config is
  'Configuracao (1 linha) do pedido de avaliacao Google via WhatsApp. ativo=false desliga tudo; modo simulacao/piloto/real.';

create table public.avaliacao_pedidos (
  id bigint generated always as identity primary key,
  service_order_id uuid unique references public.service_orders (id) on delete set null,
  customer_id uuid,
  os_number int,
  nome text,
  equipamento text,
  telefone_normalizado text not null check (telefone_normalizado ~ '^55[0-9]{11}$'),
  entregue_em timestamptz,
  status text not null check (status in ('pendente', 'enviado', 'falha_sem_envio', 'incerto', 'erro', 'ignorado')),
  motivo text,
  tentativas int not null default 0,
  modo text not null check (modo in ('simulacao', 'piloto', 'real')),
  evolution_message_id text,
  criado_em timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  alertado_em timestamptz,
  resposta_alertada_em timestamptz
);

comment on table public.avaliacao_pedidos is
  'Um pedido de avaliacao por OS. Fonte da verdade da trava "uma vez por telefone" (indice parcial avaliacao_pedidos_trava_telefone).';

-- Trava: so estas linhas bloqueiam o telefone para sempre.
-- erro e ignorado (exceto opt_out) NAO bloqueiam.
create unique index avaliacao_pedidos_trava_telefone
  on public.avaliacao_pedidos (telefone_normalizado)
  where status in ('pendente', 'falha_sem_envio', 'enviado', 'incerto') or motivo = 'opt_out';

-- Seguranca: RLS ligado, sem nenhuma policy; nada para anon/authenticated.
alter table public.avaliacao_config enable row level security;
alter table public.avaliacao_pedidos enable row level security;

revoke all on table public.avaliacao_config from anon, authenticated;
revoke all on table public.avaliacao_pedidos from anon, authenticated;

-- Configuracao inicial segura: desligado e em simulacao.
insert into public.avaliacao_config (
  id, ativo, modo, link_google, data_inicio, telefones_piloto,
  limite_por_execucao, tenant_user_id, dias_retorno_garantia
) values (
  1, false, 'simulacao', 'https://g.page/r/CSTm2CxoaW71EB0/review', now(), '{}',
  5, '601ecd47-ce04-4365-8536-43fed7bc0bdb', 90
);
