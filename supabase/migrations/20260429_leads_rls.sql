alter table if exists public.leads enable row level security;
alter table if exists public.leads force row level security;

drop policy if exists "leads_scoped_select" on public.leads;
create policy "leads_scoped_select" on public.leads
for select
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()
  )
);

drop policy if exists "leads_scoped_write" on public.leads;
create policy "leads_scoped_write" on public.leads
for all
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = leads.workspace_id
      and wm.user_id = auth.uid()
  )
);
