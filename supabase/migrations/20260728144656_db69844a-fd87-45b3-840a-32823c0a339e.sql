
-- Add producer fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS instagram text;

-- Properties
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  state text,
  country text DEFAULT 'Brasil',
  description text,
  whatsapp text,
  instagram text,
  photo_url text,
  logo_url text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY properties_owner_select ON public.properties
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY properties_owner_insert ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY properties_owner_update ON public.properties
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY properties_owner_delete ON public.properties
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX properties_owner_idx ON public.properties(owner_id);

CREATE TRIGGER properties_set_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Photo category enum
DO $$ BEGIN
  CREATE TYPE public.property_photo_category AS ENUM
    ('propriedade','lote','animais','galpao','aviario','pocilga');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Property photos
CREATE TABLE public.property_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lote_id text,
  url text NOT NULL,
  category public.property_photo_category NOT NULL DEFAULT 'propriedade',
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_photos TO authenticated;
GRANT ALL ON public.property_photos TO service_role;

ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_photos_owner_select ON public.property_photos
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY property_photos_owner_insert ON public.property_photos
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY property_photos_owner_update ON public.property_photos
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY property_photos_owner_delete ON public.property_photos
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX property_photos_property_idx ON public.property_photos(property_id);
CREATE INDEX property_photos_owner_idx ON public.property_photos(owner_id);
