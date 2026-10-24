-- =====================================================
-- مراجعة أذونات التسليم للتسعير
-- يضيف جداول جديدة فقط، ولا يغيّر أو يحذف أي شي من
-- جداول الأوراق القديمة (customers / papers / paper_images ...)
-- يمكن تشغيله أكثر من مرة بأمان.
-- =====================================================

create extension if not exists pgcrypto;

-- 1) الحسابات الجديدة (منفصلة عن زبائن الأوراق)
create table if not exists public.pricing_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  normalized_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

create unique index if not exists pricing_accounts_normalized_name_key
  on public.pricing_accounts (normalized_name);

-- 2) فواتير التسعير: كل فاتورة تابعة لحساب
create table if not exists public.pricing_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.pricing_accounts (id) on delete restrict,
  invoice_number text not null check (length(trim(invoice_number)) > 0),
  note text,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid(),
  constraint pricing_invoices_account_number_key
    unique (account_id, invoice_number)
);

create index if not exists pricing_invoices_account_idx
  on public.pricing_invoices (account_id);

create index if not exists pricing_invoices_archived_idx
  on public.pricing_invoices (is_archived);

-- 3) صور أذونات التسليم: كل صورة لها رقم إذن تسليم
create table if not exists public.pricing_images (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null
    references public.pricing_invoices (id) on delete restrict,
  delivery_number text not null check (length(trim(delivery_number)) > 0),
  image_path text not null unique,
  thumb_path text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) default auth.uid()
);

create index if not exists pricing_images_invoice_idx
  on public.pricing_images (invoice_id)
  where is_deleted = false;

create index if not exists pricing_images_delivery_idx
  on public.pricing_images (delivery_number);

-- 4) الصلاحيات: المستخدم المسجّل دخوله فقط
--    (حذف الصورة من الموقع يخفيها فقط ولا يحذف الملف)
alter table public.pricing_accounts enable row level security;
alter table public.pricing_invoices enable row level security;
alter table public.pricing_images enable row level security;

grant select, insert, update on public.pricing_accounts to authenticated;
grant select, insert, update on public.pricing_invoices to authenticated;
grant select, insert, update on public.pricing_images to authenticated;

drop policy if exists "pricing_accounts_select" on public.pricing_accounts;
drop policy if exists "pricing_accounts_insert" on public.pricing_accounts;
drop policy if exists "pricing_accounts_update" on public.pricing_accounts;

create policy "pricing_accounts_select" on public.pricing_accounts
  for select to authenticated using (true);
create policy "pricing_accounts_insert" on public.pricing_accounts
  for insert to authenticated with check (true);
create policy "pricing_accounts_update" on public.pricing_accounts
  for update to authenticated using (true) with check (true);

drop policy if exists "pricing_invoices_select" on public.pricing_invoices;
drop policy if exists "pricing_invoices_insert" on public.pricing_invoices;
drop policy if exists "pricing_invoices_update" on public.pricing_invoices;

create policy "pricing_invoices_select" on public.pricing_invoices
  for select to authenticated using (true);
create policy "pricing_invoices_insert" on public.pricing_invoices
  for insert to authenticated with check (true);
create policy "pricing_invoices_update" on public.pricing_invoices
  for update to authenticated using (true) with check (true);

drop policy if exists "pricing_images_select" on public.pricing_images;
drop policy if exists "pricing_images_insert" on public.pricing_images;
drop policy if exists "pricing_images_update" on public.pricing_images;

create policy "pricing_images_select" on public.pricing_images
  for select to authenticated using (true);
create policy "pricing_images_insert" on public.pricing_images
  for insert to authenticated with check (true);
create policy "pricing_images_update" on public.pricing_images
  for update to authenticated using (true) with check (true);

-- 4-ب) حذف فاتورة أو حساب سُجّل بالغلط
--      مسموح فقط إذا ما في تحته شي (الربط يمنع حذف فاتورة لها صور
--      أو حساب له فواتير)
grant delete on public.pricing_accounts to authenticated;
grant delete on public.pricing_invoices to authenticated;

drop policy if exists "pricing_accounts_delete" on public.pricing_accounts;
drop policy if exists "pricing_invoices_delete" on public.pricing_invoices;

create policy "pricing_accounts_delete" on public.pricing_accounts
  for delete to authenticated using (true);
create policy "pricing_invoices_delete" on public.pricing_invoices
  for delete to authenticated using (true);

-- 5) مكان حفظ الصور: حاوية خاصة جديدة (غير عامة)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pricing-images',
  'pricing-images',
  false,
  15728640, -- 15 ميغابايت
  array['image/*']
)
on conflict (id) do nothing;

drop policy if exists "pricing_images_storage_select" on storage.objects;
drop policy if exists "pricing_images_storage_insert" on storage.objects;
drop policy if exists "pricing_images_storage_delete" on storage.objects;

create policy "pricing_images_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'pricing-images');

create policy "pricing_images_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pricing-images');

-- الحذف مسموح فقط لتنظيف صورة فشل حفظها أثناء الرفع
create policy "pricing_images_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pricing-images' and owner_id = auth.uid()::text);
