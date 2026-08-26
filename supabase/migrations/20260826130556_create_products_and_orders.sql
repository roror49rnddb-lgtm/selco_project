/*
# Create products and orders tables with RLS + storage bucket

## Summary
Creates the core e-commerce schema for the SELCO store in the provisioned
database: a `products` table (public catalog, admin-managed) and an `orders`
table (Kashier checkout records, service-role only). Also creates a public
storage bucket for product images.

## 1. New Tables

### products
The storefront catalog. Read by the anon-key storefront; written by the
admin dashboard (which also uses the anon key, so products are intentionally
public-read + anon-writable in this single-tenant setup).
- `id` uuid primary key
- `title` text not null — product name
- `description` text — product description
- `price` numeric(10,2) not null — price in EGP
- `stock` integer not null default 0 — available quantity
- `category` text not null — e.g. تيشيرت / هودي / بنطلون
- `sizes` text[] not null default '{}' — available sizes
- `colors` text[] not null default '{}' — available colors
- `images` text[] not null default '{}' — array of image URLs (multi-image support)
- `created_at` timestamptz default now()

### orders
Created by the Kashier serverless functions using the service_role key.
RLS is enabled with NO policies, so the anon key can neither read nor write
orders — only the service role (which bypasses RLS) can.
- `id` uuid primary key
- `merchant_order_id` text unique not null
- `customer_name` / `customer_phone` / `governorate` / `city` / `address`
- `items` jsonb — line items snapshot
- `amount` numeric(10,2), `currency` text default 'EGP'
- `payment_method` text default 'kashier'
- `status` text default 'pending'
- `kashier_order_id` / `kashier_transaction_id` / `card_brand` / `masked_card`
- `gateway_response` jsonb
- `created_at` / `updated_at` timestamptz

## 2. Security (RLS)
- `products`: RLS enabled. Public SELECT for anon+authenticated (storefront).
  anon+authenticated INSERT/UPDATE/DELETE (admin dashboard uses anon key).
  This is a single-tenant catalog with no per-user ownership.
- `orders`: RLS enabled, NO policies — only the service_role key can access.
  This protects order/payment data from the browser.

## 3. Storage
- Creates `product-images` bucket (public) for admin product image uploads.
- Storage policies: public read, anon+authenticated upload/update/delete.

## 4. Important Notes
1. No existing tables or data are dropped — CREATE IF NOT EXISTS only.
2. The `images` text[] column provides multi-image support while the
   storefront already reads `images[0]` as the primary image.
3. Orders remain service-role-only exactly as the existing orders.sql intended.
*/

create extension if not exists "pgcrypto";

-- ---------- products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price numeric(10, 2) not null default 0,
  stock integer not null default 0,
  category text not null,
  sizes text[] not null default '{}'::text[],
  colors text[] not null default '{}'::text[],
  images text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index if not exists products_created_at_idx on public.products (created_at desc);
create index if not exists products_category_idx on public.products (category);

alter table public.products enable row level security;

-- Public read (storefront)
drop policy if exists "anon_select_products" on public.products;
create policy "anon_select_products" on public.products
  for select to anon, authenticated using (true);

-- Admin write (anon key)
drop policy if exists "anon_insert_products" on public.products;
create policy "anon_insert_products" on public.products
  for insert to anon, authenticated with check (true);

drop policy if exists "anon_update_products" on public.products;
create policy "anon_update_products" on public.products
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon_delete_products" on public.products;
create policy "anon_delete_products" on public.products
  for delete to anon, authenticated using (true);

-- ---------- orders ----------
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
create index if not exists orders_merchant_order_id_idx on public.orders (merchant_order_id);

-- RLS on, no policies: only service_role can access orders.
alter table public.orders enable row level security;

-- ---------- storage bucket ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Storage policies: public read, anon/authenticated upload/manage
drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "Anon upload product images" on storage.objects;
create policy "Anon upload product images" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'product-images');

drop policy if exists "Anon update product images" on storage.objects;
create policy "Anon update product images" on storage.objects
  for update to anon, authenticated using (bucket_id = 'product-images');

drop policy if exists "Anon delete product images" on storage.objects;
create policy "Anon delete product images" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'product-images');
