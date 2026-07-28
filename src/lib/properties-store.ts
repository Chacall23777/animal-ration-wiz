import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Property = {
  id: string;
  owner_id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  description: string | null;
  whatsapp: string | null;
  instagram: string | null;
  photo_url: string | null;
  logo_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ProducerProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  whatsapp: string | null;
  instagram: string | null;
};

const ACTIVE_KEY = "arna_active_property_v1";

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function useProperties(userId: string | undefined) {
  return useQuery({
    queryKey: ["properties", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Property[];
    },
  });
}

export function useProducerProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["producer-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, whatsapp, instagram")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProducerProfile | null;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Active property (local)                                             */
/* ------------------------------------------------------------------ */

export function useActiveProperty(properties: Property[] | undefined) {
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_KEY);
  });

  useEffect(() => {
    if (!properties || properties.length === 0) return;
    const found = activeId ? properties.find((p) => p.id === activeId) : null;
    if (!found) {
      const def = properties.find((p) => p.is_default) ?? properties[0];
      setActiveId(def.id);
      try { localStorage.setItem(ACTIVE_KEY, def.id); } catch {}
    }
  }, [properties, activeId]);

  const select = (id: string) => {
    setActiveId(id);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
  };

  const active = properties?.find((p) => p.id === activeId) ?? null;
  return { active, activeId, select };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function useCreateProperty(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Property> & { name: string }) => {
      if (!userId) throw new Error("Sem sessão");
      const { data, error } = await supabase
        .from("properties")
        .insert({
          owner_id: userId,
          name: input.name,
          city: input.city ?? null,
          state: input.state ?? null,
          country: input.country ?? "Brasil",
          description: input.description ?? null,
          whatsapp: input.whatsapp ?? null,
          instagram: input.instagram ?? null,
          photo_url: input.photo_url ?? null,
          logo_url: input.logo_url ?? null,
          is_default: input.is_default ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Property;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties", userId] }),
  });
}

export function useUpdateProperty(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Property> }) => {
      const { data, error } = await supabase
        .from("properties")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Property;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties", userId] }),
  });
}

export function useUpdateProducerProfile(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ProducerProfile>) => {
      if (!userId) throw new Error("Sem sessão");
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select()
        .single();
      if (error) throw error;
      return data as ProducerProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["producer-profile", userId] }),
  });
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */

type Bucket = "avatars" | "property-photos" | "property-logos";

/**
 * Uploads a file and returns the storage path.
 * We store the *path* (not signed URL) in DB — signed URLs are generated on read.
 */
export async function uploadToBucket(
  bucket: Bucket,
  userId: string,
  file: File,
  subpath: string[] = [],
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const key = [userId, ...subpath, `${stamp}.${ext}`].filter(Boolean).join("/");
  const { error } = await supabase.storage.from(bucket).upload(key, file, {
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  return `${bucket}/${key}`;
}

/** Returns a signed URL for a stored path like "bucket/key". */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-url", path],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const [bucket, ...rest] = path.split("/");
      const key = rest.join("/");
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Property photos (gallery)                                           */
/* ------------------------------------------------------------------ */

export type PropertyPhoto = {
  id: string;
  property_id: string;
  owner_id: string;
  lote_id: string | null;
  url: string; // storage path
  category: "propriedade" | "lote" | "animais" | "galpao" | "aviario" | "pocilga";
  caption: string | null;
  created_at: string;
};

export function usePropertyPhotos(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["property-photos", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_photos")
        .select("*")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PropertyPhoto[];
    },
  });
}

export function useAddPropertyPhoto(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      file,
      category,
      caption,
      loteId,
    }: {
      propertyId: string;
      file: File;
      category: PropertyPhoto["category"];
      caption?: string;
      loteId?: string;
    }) => {
      if (!userId) throw new Error("Sem sessão");
      const path = await uploadToBucket("property-photos", userId, file, [propertyId, category]);
      const { data, error } = await supabase
        .from("property_photos")
        .insert({
          property_id: propertyId,
          owner_id: userId,
          url: path,
          category,
          caption: caption ?? null,
          lote_id: loteId ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PropertyPhoto;
    },
    onSuccess: (photo) =>
      qc.invalidateQueries({ queryKey: ["property-photos", photo.property_id] }),
  });
}