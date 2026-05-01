alter table if exists public.voice_notes
  add column if not exists transcript text,
  add column if not exists summary text,
  add column if not exists sentiment text,
  add column if not exists sentiment_score double precision,
  add column if not exists source_provider text,
  add column if not exists audio_source_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
