-- Registro do cancelamento de NFS-e (feito pela Edge Function bling-nfse, action 'cancel').
alter table public.nfse_emissions
  add column if not exists canceled_at timestamptz,
  add column if not exists cancel_reason text;
