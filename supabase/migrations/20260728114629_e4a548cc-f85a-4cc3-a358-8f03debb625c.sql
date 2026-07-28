
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifetime_access boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifetime_granted_at timestamptz;

-- Update has_active_subscription to include lifetime access
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.lifetime_access = true)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND (
          s.status IN ('active','trialing','past_due')
          OR (s.status = 'canceled' AND s.current_period_end > now())
        )
    )
$function$;

-- Update handle_new_user to grant lifetime access to admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, lifetime_access, lifetime_granted_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    CASE WHEN LOWER(COALESCE(NEW.email, '')) = 'rogeriopereira289@gmail.com' THEN true ELSE false END,
    CASE WHEN LOWER(COALESCE(NEW.email, '')) = 'rogeriopereira289@gmail.com' THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF LOWER(COALESCE(NEW.email, '')) = 'rogeriopereira289@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill lifetime access for the admin email if user already exists
UPDATE public.profiles
SET lifetime_access = true, lifetime_granted_at = COALESCE(lifetime_granted_at, now())
WHERE LOWER(email) = 'rogeriopereira289@gmail.com';
