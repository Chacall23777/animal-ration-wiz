
-- Storage policies: only owner (matching path prefix "<uid>/...") can read/write
CREATE POLICY "arna_avatars_owner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "arna_property_photos_owner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'property-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'property-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "arna_property_logos_owner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'property-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'property-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
