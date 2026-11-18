-- Conexão OAuth2 do OSDANTAS com o Bling (API v3), uma por assistência (tenant).
-- Os tokens NUNCA são lidos pelo navegador: RLS ligado e SEM policies, então só a
-- service role (Edge Functions bling-auth-start / bling-callback / futuras) acessa.
create table if not exists public.bling_connections (
  tenant_user_id uuid primary key,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bling_connections enable row level security;

comment on table public.bling_connections is
  'Tokens OAuth2 do Bling por assistencia. RLS ligado sem policies: acesso apenas via service role (Edge Functions). Nunca expor ao cliente.';

-- Status seguro para a UI (não devolve tokens): a assistência atual está conectada?
create or replace function public.bling_connection_status()
returns table (connected boolean, connected_at timestamptz, refresh_expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select true, c.connected_at, c.refresh_expires_at
  from public.bling_connections c
  where c.tenant_user_id = public.current_tenant_id()
  union all
  select false, null, null
  where not exists (
    select 1 from public.bling_connections c where c.tenant_user_id = public.current_tenant_id()
  )
  limit 1;
$$;

revoke all on function public.bling_connection_status() from public, anon;
grant execute on function public.bling_connection_status() to authenticated;
