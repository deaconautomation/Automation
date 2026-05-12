-- Profiles table (one row per user)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  business_name text default '',
  is_admin boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- Inventory items table
create table if not exists public.inventory_items (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references auth.users on delete cascade not null,
  name text not null,
  sku text default '',
  category text default '',
  qty integer default 0,
  threshold integer default 0,
  price decimal(10,2) default 0,
  supplier text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.inventory_items enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Profiles policies (drop + recreate so re-runs are safe)
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;

create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy "profiles_update" on public.profiles for update
  using (auth.uid() = id);
create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id);

-- Inventory policy
drop policy if exists "inventory_all" on public.inventory_items;

create policy "inventory_all" on public.inventory_items for all
  using (auth.uid() = client_id or public.is_admin())
  with check (auth.uid() = client_id or public.is_admin());

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, business_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'business_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at on inventory changes
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists inventory_updated_at on public.inventory_items;
create trigger inventory_updated_at
  before update on public.inventory_items
  for each row execute function public.update_updated_at();

-- Inventory activity log
create table if not exists public.inventory_logs (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references public.inventory_items on delete cascade not null,
  client_id uuid references auth.users on delete cascade not null,
  item_name text not null,
  action text not null,        -- 'add', 'edit', 'delete', 'adjust'
  qty_before integer,
  qty_after integer,
  note text default '',
  created_at timestamptz default now()
);
alter table public.inventory_logs enable row level security;

drop policy if exists "logs_all" on public.inventory_logs;
create policy "logs_all" on public.inventory_logs for all
  using (auth.uid() = client_id or public.is_admin())
  with check (auth.uid() = client_id or public.is_admin());

-- Grant admin flag (safe to re-run — inserts profile if missing, then sets is_admin)
insert into public.profiles (id, business_name, is_admin)
select id, '', true
from auth.users
where email = 'deacon.automation@gmail.com'
on conflict (id) do update set is_admin = true;
