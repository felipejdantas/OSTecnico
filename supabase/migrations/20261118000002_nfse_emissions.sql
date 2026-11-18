-- Notas de serviço (NFS-e) emitidas pelo Bling a partir de uma OS.
-- Gravação só pela Edge Function bling-nfse (service role); o cliente apenas lê as da sua assistência.
create table if not exists public.nfse_emissions (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null,
  service_order_id uuid not null,
  bling_nfse_id bigint,
  numero text,
  status text not null default 'processando'
    check (status in ('processando', 'enviada', 'emitida', 'cancelada', 'erro')),
  valor numeric(12, 2) not null default 0,
  link text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma nota "viva" por OS: bloqueia clique duplo e emissão em duplicidade.
create unique index if not exists nfse_emissions_one_active_per_os
  on public.nfse_emissions (service_order_id)
  where status in ('processando', 'enviada', 'emitida');

create index if not exists nfse_emissions_tenant_idx on public.nfse_emissions (tenant_user_id, created_at desc);

alter table public.nfse_emissions enable row level security;

create policy "Users can view their tenant nfse emissions"
  on public.nfse_emissions for select
  using (tenant_user_id = (select public.current_tenant_id()));

comment on table public.nfse_emissions is
  'NFS-e emitidas via Bling a partir de OS. Escrita apenas pela Edge Function bling-nfse (service role).';
