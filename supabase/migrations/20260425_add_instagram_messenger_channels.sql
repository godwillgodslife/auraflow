do $$
begin
  alter type public.message_channel add value if not exists 'instagram';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.message_channel add value if not exists 'messenger';
exception
  when duplicate_object then null;
end $$;

