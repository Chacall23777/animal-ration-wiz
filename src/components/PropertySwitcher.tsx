import { useState } from "react";
import type { Property } from "@/lib/properties-store";
import { useSignedUrl } from "@/lib/properties-store";

type Props = {
  properties: Property[];
  active: Property | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export function PropertySwitcher({ properties, active, onSelect, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const logo = useSignedUrl(active?.logo_url ?? active?.photo_url ?? null);

  return (
    <div className="ps-wrap">
      <button className="ps-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox">
        {logo.data ? (
          <img src={logo.data} alt="" className="ps-avatar" />
        ) : (
          <span className="ps-avatar ps-placeholder">🌱</span>
        )}
        <span className="ps-name">{active?.name ?? "Selecionar propriedade"}</span>
        <span className="ps-caret">▾</span>
      </button>
      {open && (
        <div className="ps-menu" role="listbox" onMouseLeave={() => setOpen(false)}>
          {properties.map((p) => (
            <button
              key={p.id}
              className={`ps-item ${p.id === active?.id ? "on" : ""}`}
              onClick={() => {
                onSelect(p.id);
                setOpen(false);
              }}
            >
              <span>{p.name}</span>
              <small>{[p.city, p.state].filter(Boolean).join(" · ")}</small>
            </button>
          ))}
          <button
            className="ps-item ps-add"
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
          >
            + Nova propriedade
          </button>
        </div>
      )}
      <style>{`
        .ps-wrap{position:relative}
        .ps-btn{display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border-radius:999px;
          background:linear-gradient(135deg,var(--gold,#D9A441),var(--gold-deep,#B27F27));
          border:2px solid var(--ink,#2B2420);color:#fff;font:inherit;font-weight:700;cursor:pointer;
          box-shadow:0 4px 14px rgba(178,127,39,.35);
          transition:transform .12s ease, box-shadow .15s ease;}
        .ps-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(178,127,39,.5)}
        .ps-btn::before{content:"✚";font-size:12px;font-weight:900;background:#fff;color:var(--gold-deep,#B27F27);
          width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;flex-shrink:0}
        .ps-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover;display:inline-grid;place-items:center;background:rgba(255,255,255,.25);font-size:12px;flex-shrink:0}
        .ps-placeholder{color:#fff}
        .ps-name{font-weight:800;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.3px}
        .ps-caret{opacity:.9}
        .ps-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:260px;max-width:calc(100vw - 24px);background:var(--surface,#fff);color:var(--fg,#111);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.2);padding:6px;z-index:50;display:flex;flex-direction:column;gap:2px}
        .ps-item{text-align:left;padding:10px 12px;border-radius:8px;border:0;background:transparent;color:inherit;cursor:pointer;display:flex;flex-direction:column;white-space:normal;word-break:break-word}
        .ps-item:hover{background:rgba(0,0,0,.06)}
        .ps-item.on{background:rgba(46,125,50,.12);font-weight:700}
        .ps-item small{opacity:.6;font-size:.75rem}
        .ps-add{color:var(--gold-deep,#B27F27);font-weight:800;border-top:1px solid rgba(0,0,0,.08);border-radius:0 0 8px 8px;margin-top:4px}
        @media (max-width:520px){
          .ps-btn{padding:7px 14px;font-size:.9rem}
          .ps-name{max-width:110px}
          .ps-menu{position:fixed;left:12px;right:12px;top:auto;bottom:12px;min-width:0;max-width:none;width:auto;padding:8px;border-radius:16px;box-shadow:0 -8px 30px rgba(0,0,0,.35)}
          .ps-item{padding:12px 14px;font-size:1rem}
        }
      `}</style>
    </div>
  );
}