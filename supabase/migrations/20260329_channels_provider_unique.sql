create unique index if not exists idx_channels_workspace_provider
  on public.channels(workspace_id, provider);
