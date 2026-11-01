-- Run once in Supabase SQL Editor. Applies to customers and administrators.
-- Read the original session creation time, never the refreshed JWT issuance time.
begin;
create or replace function public.get_current_session_deadline()
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  select s.created_at + interval '24 hours'
  from auth.sessions s
  where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
    and s.user_id = auth.uid();
$$;
revoke all on function public.get_current_session_deadline() from public, anon;
grant execute on function public.get_current_session_deadline() to authenticated;
commit;
