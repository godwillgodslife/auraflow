alter table if exists public.voice_notes
  add column if not exists voice_session_id uuid references public.voice_sessions(id) on delete set null;

alter table if exists public.voice_sessions
  add column if not exists outcome text,
  add column if not exists analysis_status text,
  add column if not exists analysis_summary text,
  add column if not exists analysis_sentiment text,
  add column if not exists analysis_metadata jsonb not null default '{}'::jsonb;
