do $$
begin
  alter type public.message_channel add value if not exists 'email';
exception
  when duplicate_object then null;
end $$;
