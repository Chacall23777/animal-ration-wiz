-- 1) Set immutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) Tighten EXECUTE on SECURITY DEFINER helper only used by server code
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO service_role;

-- Note: public.has_role(uuid, app_role) intentionally remains EXECUTE-able by
-- authenticated because it is referenced inside RLS policies (profiles,
-- subscriptions, user_roles, audit_logs) which are evaluated as the caller.
-- Revoking would break access control for legitimate users.

-- 3) Admin-only read policy for audit_logs (RLS is already enabled)
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.audit_logs TO authenticated;