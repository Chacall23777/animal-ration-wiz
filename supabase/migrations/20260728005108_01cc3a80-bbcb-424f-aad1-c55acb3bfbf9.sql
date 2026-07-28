CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  client_id text NULL,
  action text NOT NULL,
  resource text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX audit_logs_action_created_at_idx ON public.audit_logs (action, created_at DESC);
CREATE INDEX audit_logs_user_id_idx ON public.audit_logs (user_id);