begin;
create or replace function public.session_meets_mfa()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and (
   coalesce(auth.jwt()->>'aal','aal1')='aal2'
   or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
 );
$$;
revoke all on function public.session_meets_mfa() from public,anon;
grant execute on function public.session_meets_mfa() to authenticated;
drop policy if exists workspace_mfa on public.workspaces;
create policy workspace_mfa on public.workspaces as restrictive for all to authenticated
 using(public.session_meets_mfa()) with check(public.session_meets_mfa());
drop policy if exists profile_mfa on public.profiles;
create policy profile_mfa on public.profiles as restrictive for all to authenticated
 using(public.session_meets_mfa()) with check(public.session_meets_mfa());
commit;
