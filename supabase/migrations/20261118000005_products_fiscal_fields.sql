-- Dados fiscais do produto que vão para a NF-e (aba "Tributação" do cadastro). O NCM já existe (migration 4).
alter table public.products
  add column if not exists origem smallint not null default 0,
  add column if not exists cest text,
  add column if not exists gtin text,
  add column if not exists tributos_pct numeric(5, 2) not null default 0;

alter table public.products drop constraint if exists products_origem_range;
alter table public.products add constraint products_origem_range check (origem between 0 and 8);
alter table public.products drop constraint if exists products_cest_format;
alter table public.products add constraint products_cest_format check (cest is null or cest ~ '^[0-9]{7}$');
alter table public.products drop constraint if exists products_gtin_format;
alter table public.products add constraint products_gtin_format check (gtin is null or gtin ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$');
alter table public.products drop constraint if exists products_tributos_pct_range;
alter table public.products add constraint products_tributos_pct_range check (tributos_pct between 0 and 100);
