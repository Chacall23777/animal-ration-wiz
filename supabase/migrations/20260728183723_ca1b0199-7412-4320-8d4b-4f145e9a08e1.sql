
-- Enum de tipo de acesso
DO $$ BEGIN
  CREATE TYPE public.access_type AS ENUM ('super_admin','admin','lifetime','trial','blocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.access_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  access_type public.access_type NOT NULL DEFAULT 'blocked',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_protected boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_control TO authenticated;
GRANT ALL ON public.access_control TO service_role;

ALTER TABLE public.access_control ENABLE ROW LEVEL SECURITY;

-- Usuário pode ler o próprio registro (por email do JWT)
CREATE POLICY access_control_self_select ON public.access_control
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Somente admins escrevem
CREATE POLICY access_control_admin_all ON public.access_control
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_access_control_updated_at ON public.access_control;
CREATE TRIGGER trg_access_control_updated_at
  BEFORE UPDATE ON public.access_control
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger de proteção do super admin
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_protected THEN RAISE EXCEPTION 'Super administrador protegido não pode ser removido.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_protected THEN
    IF NEW.access_type <> 'super_admin' OR NEW.email <> OLD.email OR NEW.is_protected = false THEN
      RAISE EXCEPTION 'Super administrador protegido não pode ser alterado.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.access_control;
CREATE TRIGGER trg_protect_super_admin
  BEFORE UPDATE OR DELETE ON public.access_control
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

-- Semear super admin protegido
INSERT INTO public.access_control (email, full_name, access_type, is_protected, activated_at)
VALUES ('rogeriopereira289@gmail.com', 'Rogério Aguiar', 'super_admin', true, now())
ON CONFLICT (email) DO UPDATE SET access_type='super_admin', is_protected=true;

-- Função de resolução
CREATE OR REPLACE FUNCTION public.resolve_access(_email text)
RETURNS public.access_type
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT access_type FROM public.access_control WHERE lower(email) = lower(_email) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_access(text) TO authenticated, anon;

-- Estender handle_new_user para consumir access_control
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := LOWER(COALESCE(NEW.email, ''));
  v_ac public.access_control%ROWTYPE;
  v_pending public.pending_access%ROWTYPE;
  v_lifetime boolean := false;
  v_until timestamptz;
BEGIN
  SELECT * INTO v_ac FROM public.access_control WHERE lower(email)=v_email LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, lifetime_access, lifetime_granted_at)
  VALUES (
    NEW.id, COALESCE(NEW.email,''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_ac.full_name),
    CASE WHEN v_email='rogeriopereira289@gmail.com' OR v_ac.access_type IN ('super_admin','lifetime') THEN true ELSE false END,
    CASE WHEN v_email='rogeriopereira289@gmail.com' OR v_ac.access_type IN ('super_admin','lifetime') THEN now() ELSE NULL END
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

  IF v_email='rogeriopereira289@gmail.com' OR v_ac.access_type IN ('super_admin','admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Ativa access_control se existia como pending
  IF FOUND THEN
    UPDATE public.access_control SET activated_at = COALESCE(activated_at, now()) WHERE id = v_ac.id;
  END IF;

  -- Legado: pending_access
  SELECT * INTO v_pending FROM public.pending_access
    WHERE LOWER(email)=v_email AND used_at IS NULL LIMIT 1;
  IF FOUND THEN
    v_lifetime := v_pending.lifetime;
    v_until := now() + (v_pending.days || ' days')::interval;
    IF NOT v_lifetime THEN
      INSERT INTO public.subscriptions (user_id, stripe_subscription_id, status, price_id, current_period_end, environment)
      VALUES (NEW.id, 'manual_'||NEW.id::text, 'active', 'admin_grant', v_until, 'manual')
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET status='active', current_period_end=EXCLUDED.current_period_end;
    END IF;
    UPDATE public.pending_access SET used_at=now() WHERE id=v_pending.id;
  END IF;

  RETURN NEW;
END $$;

-- Migrar admins existentes do user_roles para access_control (lifetime/admin conforme perfil)
INSERT INTO public.access_control (email, full_name, access_type, activated_at)
SELECT p.email, p.full_name, 'admin'::public.access_type, now()
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
WHERE lower(p.email) <> 'rogeriopereira289@gmail.com'
ON CONFLICT (email) DO NOTHING;

-- Migrar lifetime existentes
INSERT INTO public.access_control (email, full_name, access_type, activated_at)
SELECT p.email, p.full_name, 'lifetime'::public.access_type, now()
FROM public.profiles p
WHERE p.lifetime_access = true AND lower(p.email) <> 'rogeriopereira289@gmail.com'
ON CONFLICT (email) DO NOTHING;

-- Migrar assinantes ativos (trial ou lifetime pelo status)
INSERT INTO public.access_control (email, full_name, access_type, activated_at)
SELECT p.email, p.full_name,
  CASE WHEN s.status = 'trialing' THEN 'trial'::public.access_type ELSE 'lifetime'::public.access_type END,
  now()
FROM public.profiles p
JOIN public.subscriptions s ON s.user_id = p.id
WHERE s.status IN ('active','trialing','past_due')
ON CONFLICT (email) DO NOTHING;
