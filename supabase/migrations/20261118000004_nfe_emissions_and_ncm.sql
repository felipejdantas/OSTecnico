-- NCM no cadastro de produtos (a NF-e exige; guardado só com dígitos, 8 posições).
alter table public.products add column if not exists ncm text;
alter table public.products drop constraint if exists products_ncm_format;
alter table public.products add constraint products_ncm_format check (ncm is null or ncm ~ '^[0-9]{8}$');

-- NF-e (produtos) emitidas pelo Bling a partir de uma OS.
-- Escrita só pela Edge Function bling-nfe (service role); o cliente apenas lê as da sua assistência.
create table if not exists public.nfe_emissions (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null,
  service_order_id uuid not null,
  bling_nfe_id bigint,
  numero text,
  status text not null default 'processando'
    check (status in ('processando', 'enviada', 'emitida', 'cancelada', 'erro')),
  valor numeric(12, 2) not null default 0,
  link text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nfe_emissions_one_active_per_os
  on public.nfe_emissions (service_order_id)
  where status in ('processando', 'enviada', 'emitida');

create index if not exists nfe_emissions_tenant_idx on public.nfe_emissions (tenant_user_id, created_at desc);

alter table public.nfe_emissions enable row level security;

create policy "Users can view their tenant nfe emissions"
  on public.nfe_emissions for select
  using (tenant_user_id = (select public.current_tenant_id()));

comment on table public.nfe_emissions is
  'NF-e de produtos emitidas via Bling a partir de OS. Escrita apenas pela Edge Function bling-nfe (service role).';
