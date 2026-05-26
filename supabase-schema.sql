create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null,
  value numeric(12, 2) not null default 0,
  received numeric(12, 2) not null default 0,
  status text not null default 'Em desenvolvimento',
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12, 2) not null default 0,
  payment_date date not null,
  project_id uuid references public.projects(id) on delete set null,
  method text not null default 'Pix',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12, 2) not null default 0,
  due_day integer not null check (due_day between 1 and 31),
  frequency text not null default 'Mensal',
  status text not null default 'Ativa',
  client text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists recurring_transactions_set_updated_at on public.recurring_transactions;
create trigger recurring_transactions_set_updated_at
before update on public.recurring_transactions
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.payments enable row level security;
alter table public.recurring_transactions enable row level security;

grant usage on schema public to anon;
grant select, insert, update, delete on public.projects to anon;
grant select, insert, update, delete on public.payments to anon;
grant select, insert, update, delete on public.recurring_transactions to anon;

drop policy if exists "Anon can read projects" on public.projects;
create policy "Anon can read projects"
on public.projects for select
to anon
using (true);

drop policy if exists "Anon can insert projects" on public.projects;
create policy "Anon can insert projects"
on public.projects for insert
to anon
with check (true);

drop policy if exists "Anon can update projects" on public.projects;
create policy "Anon can update projects"
on public.projects for update
to anon
using (true)
with check (true);

drop policy if exists "Anon can delete projects" on public.projects;
create policy "Anon can delete projects"
on public.projects for delete
to anon
using (true);

drop policy if exists "Anon can read payments" on public.payments;
create policy "Anon can read payments"
on public.payments for select
to anon
using (true);

drop policy if exists "Anon can insert payments" on public.payments;
create policy "Anon can insert payments"
on public.payments for insert
to anon
with check (true);

drop policy if exists "Anon can update payments" on public.payments;
create policy "Anon can update payments"
on public.payments for update
to anon
using (true)
with check (true);

drop policy if exists "Anon can delete payments" on public.payments;
create policy "Anon can delete payments"
on public.payments for delete
to anon
using (true);

drop policy if exists "Anon can read recurring transactions" on public.recurring_transactions;
create policy "Anon can read recurring transactions"
on public.recurring_transactions for select
to anon
using (true);

drop policy if exists "Anon can insert recurring transactions" on public.recurring_transactions;
create policy "Anon can insert recurring transactions"
on public.recurring_transactions for insert
to anon
with check (true);

drop policy if exists "Anon can update recurring transactions" on public.recurring_transactions;
create policy "Anon can update recurring transactions"
on public.recurring_transactions for update
to anon
using (true)
with check (true);

drop policy if exists "Anon can delete recurring transactions" on public.recurring_transactions;
create policy "Anon can delete recurring transactions"
on public.recurring_transactions for delete
to anon
using (true);
