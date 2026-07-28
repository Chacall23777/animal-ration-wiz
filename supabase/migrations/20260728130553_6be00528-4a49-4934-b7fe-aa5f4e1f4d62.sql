
CREATE TABLE IF NOT EXISTS public.pending_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  days integer NOT NULL DEFAULT 30,
  lifetime boolean NOT NULL DEFAULT false,
  granted_by uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_access TO authenticated;
GRANT ALL ON public.pending_access TO service_role;

ALTER TABLE public.pending_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_access_admin_all ON public.pending_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_email text := LOWER(COALESCE(NEW.email, ''));
  v_pending public.pending_access%ROWTYPE;
  v_lifetime boolean := false;
  v_until timestamptz;
BEGIN
  -- Consome acesso pendente, se houver
  SELECT * INTO v_pending FROM public.pending_access
    WHERE LOWER(email) = v_email AND used_at IS NULL
    LIMIT 1;

  IF FOUND THEN
    v_lifetime := v_pending.lifetime;
    v_until := now() + (v_pending.days || ' days')::interval;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, lifetime_access, lifetime_granted_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    CASE WHEN v_email = 'rogeriopereira289@gmail.com' OR v_lifetime THEN true ELSE false END,
    CASE WHEN v_email = 'rogeriopereira289@gmail.com' OR v_lifetime THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_email = 'rogeriopereira289@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Aplica a assinatura manual, se veio de um convite
  IF FOUND AND NOT v_lifetime THEN
    INSERT INTO public.subscriptions (
      user_id, stripe_subscription_id, status, price_id, current_period_end, environment
    ) VALUES (
      NEW.id, 'manual_' || NEW.id::text, 'active', 'admin_grant', v_until, 'manual'
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE
      SET status = 'active', current_period_end = EXCLUDED.current_period_end;

    UPDATE public.pending_access SET used_at = now() WHERE id = v_pending.id;
  ELSIF FOUND AND v_lifetime THEN
    UPDATE public.pending_access SET used_at = now() WHERE id = v_pending.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Garante o trigger em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
