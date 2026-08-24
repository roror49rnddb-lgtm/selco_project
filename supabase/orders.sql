-- SELCO orders table used by the Kashier checkout flow.
-- Run in Supabase → SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_order_id text not null unique,
  customer_name text not null,
  customer_phone text not null,
  governorate text,
  city text,
  address text not null,
  items jsonb not null default '[]'::jsonb,
  amount numeric(10, 2) not null,
  currency text not null default 'EGP',
  payment_method text not null default 'kashier',
  status text not null default 'pending',
  kashier_order_id text,
  kashier_transaction_id text,
  card_brand text,
  masked_card text,
  gateway_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

-- RLS on with no policies: the anon key cannot read or write orders.
-- The serverless functions use the service_role key, which bypasses RLS.
alter table public.orders enable row level security;
