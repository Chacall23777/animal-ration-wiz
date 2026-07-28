import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  useCreateProperty,
  useUpdateProducerProfile,
  uploadToBucket,
} from "@/lib/properties-store";

type Props = {
  user: User;
  onDone: () => void;
  onCancel?: () => void;
  allowCancel?: boolean;
};

export function PropertyOnboarding({ user, onDone, onCancel, allowCancel }: Props) {
  const createProperty = useCreateProperty(user.id);
  const updateProfile = useUpdateProducerProfile(user.id);

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Step 1 — producer
  const [fullName, setFullName] = useState(
    (user.user_metadata as { full_name?: string })?.full_name ?? "",
  );
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Step 2 — property
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("Brasil");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  async function submit() {
    setErr(null);
    if (!fullName.trim()) return setErr("Informe seu nome completo.");
    if (!name.trim()) return setErr("Informe o nome da propriedade.");
    if (!city.trim() || !state.trim()) return setErr("Informe cidade e estado.");
    setSaving(true);
    try {
      let avatarPath: string | null = null;
      if (avatarFile) avatarPath = await uploadToBucket("avatars", user.id, avatarFile);
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        whatsapp: whatsapp.trim() || null,
        instagram: instagram.trim() || null,
        ...(avatarPath ? { avatar_url: avatarPath } : {}),
      });

      let photoPath: string | null = null;
      let logoPath: string | null = null;
      if (photoFile) photoPath = await uploadToBucket("property-photos", user.id, photoFile, ["_setup"]);
      if (logoFile) logoPath = await uploadToBucket("property-logos", user.id, logoFile);

      await createProperty.mutateAsync({
        name: name.trim(),
        city: city.trim(),
        state: state.trim(),
        country: country.trim() || "Brasil",
        description: description.trim() || null,
        whatsapp: whatsapp.trim() || null,
        instagram: instagram.trim() || null,
        photo_url: photoPath,
        logo_url: logoPath,
        is_default: true,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pw-scrim" role="dialog" aria-modal="true">
      <div className="pw-modal">
        <div className="pw-header">
          <h2>Bem-vindo à ARNA 🌱</h2>
          <p className="muted">
            {step === 1
              ? "Vamos começar cadastrando você, o produtor."
              : "Agora nos conte sobre a sua propriedade."}
          </p>
          <div className="pw-progress">
            <span className={step >= 1 ? "on" : ""} />
            <span className={step >= 2 ? "on" : ""} />
          </div>
        </div>

        {step === 1 && (
          <div className="pw-grid">
            <label>
              Foto do perfil
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              Nome completo *
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rogério Aguiar" />
            </label>
            <label>
              WhatsApp
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(35) 99999-0000" />
            </label>
            <label>
              Instagram
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@aguiar_nutricao" />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="pw-grid">
            <label className="pw-full">
              Nome da propriedade *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fazenda Santa Luzia" />
            </label>
            <label>
              Cidade *
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Passos" />
            </label>
            <label>
              Estado *
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="MG" />
            </label>
            <label>
              País
              <input value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>
            <label className="pw-full">
              Descrição da propriedade
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Criação de suínos e aves..."
              />
            </label>
            <label>
              Foto da propriedade
              <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </label>
            <label>
              Logo da propriedade
              <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        )}

        {err && <p className="pw-err">{err}</p>}

        <div className="pw-actions">
          {allowCancel && onCancel && (
            <button className="btn ghost" onClick={onCancel} disabled={saving}>
              Voltar ao início
            </button>
          )}
          {step === 2 && (
            <button className="btn ghost" onClick={() => setStep(1)} disabled={saving}>
              Voltar
            </button>
          )}
          {step === 1 ? (
            <button
              className="btn"
              disabled={!fullName.trim()}
              onClick={() => setStep(2)}
            >
              Continuar
            </button>
          ) : (
            <button className="btn" onClick={submit} disabled={saving}>
              {saving ? "Salvando..." : "Concluir"}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .pw-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:9999;display:grid;place-items:center;padding:8px}
        .pw-modal{background:var(--surface,#fff);color:var(--fg,#111);width:min(560px,100%);max-height:96vh;overflow:auto;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:18px}
        .pw-header h2{margin:0 0 4px}
        .pw-header .muted{margin:0 0 12px;opacity:.7;font-size:.95rem}
        .pw-progress{display:flex;gap:6px;margin-bottom:16px}
        .pw-progress span{flex:1;height:6px;border-radius:3px;background:rgba(0,0,0,.1)}
        .pw-progress span.on{background:var(--brand,#2e7d32)}
        .pw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .pw-full{grid-column:1 / -1}
        .pw-grid label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600}
        .pw-grid input,.pw-grid textarea{padding:10px 12px;border:1px solid rgba(0,0,0,.15);border-radius:10px;background:transparent;color:inherit;font:inherit}
        .pw-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:18px}
        .pw-actions .btn{flex:1 1 auto;min-width:0}
        .pw-err{color:#c62828;margin:8px 0 0;font-size:.9rem}
        @media (max-width:520px){
          .pw-grid{grid-template-columns:1fr}
          .pw-modal{padding:14px;border-radius:16px}
          .pw-header h2{font-size:1.15rem}
          .pw-header .muted{font-size:.85rem}
        }
      `}</style>
    </div>
  );
}