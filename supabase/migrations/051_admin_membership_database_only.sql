BEGIN;
-- Browser sessions may read the list when permitted, but membership changes
-- belong to the project owner in Supabase, never a website session.
DROP POLICY IF EXISTS "Admins can manage admin_users" ON public.admin_users;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_users FROM anon, authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
