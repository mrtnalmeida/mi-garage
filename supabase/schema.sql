-- Mi Garage: un documento JSON por vehículo, privado para cada usuario.
create table if not exists public.garage_vehicles (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.garage_vehicles enable row level security;

create policy "garage: ver lo propio" on public.garage_vehicles for select using (user_id = auth.uid());
create policy "garage: crear lo propio" on public.garage_vehicles for insert with check (user_id = auth.uid());
create policy "garage: editar lo propio" on public.garage_vehicles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "garage: borrar lo propio" on public.garage_vehicles for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.garage_vehicles;
