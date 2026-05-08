-- Profiles table (one row per user)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  business_name text default '',
  is_admin boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- Inventory items table
create table public.inventory_items (
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

-- Helper: check if current user is admin (security definer avoids recursion)
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Profiles: users see own row; admin sees all
create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy "profiles_update" on public.profiles for update
  using (auth.uid() = id);
create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id);

-- Inventory: users access own rows; admin accesses all
create policy "inventory_all" on public.inventory_items for all
  using (auth.uid() = client_id or public.is_admin())
  with check (auth.uid() = client_id or public.is_admin());

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, business_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'business_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at on inventory changes
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger inventory_updated_at
  before update on public.inventory_items
  for each row execute function public.update_updated_at();
