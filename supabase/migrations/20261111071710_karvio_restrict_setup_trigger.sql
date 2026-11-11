-- Supabase's optional automatic-RLS event trigger is internal, not an HTTP API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
