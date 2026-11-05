-- Per-account settings that follow a reader across devices. Starts with the light/dark theme.
create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme text check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "users read own preferences" on public.user_preferences
  for select using (user_id = auth.uid());

create policy "users add own preferences" on public.user_preferences
  for insert with check (user_id = auth.uid());

create policy "users change own preferences" on public.user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.user_preferences to authenticated;
