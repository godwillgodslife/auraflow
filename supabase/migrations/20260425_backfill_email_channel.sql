update public.messages
set channel = 'email'::public.message_channel
where lower(coalesce(source_provider, '')) = 'gmail'
  and channel is distinct from 'email'::public.message_channel;

