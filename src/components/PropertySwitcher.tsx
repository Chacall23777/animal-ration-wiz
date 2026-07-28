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
        .ps-btn{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:inherit;font:inherit;cursor:pointer}
        .ps-btn:hover{background:rgba(255,255,255,.14)}
        .ps-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover;display:inline-grid;place-items:center;background:rgba(255,255,255,.15);font-size:12px}
        .ps-placeholder{color:#fff}
        .ps-name{font-weight:700;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ps-caret{opacity:.7}
        .ps-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:240px;background:var(--surface,#fff);color:var(--fg,#111);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.2);padding:6px;z-index:50;display:flex;flex-direction:column;gap:2px}
        .ps-item{text-align:left;padding:8px 10px;border-radius:8px;border:0;background:transparent;color:inherit;cursor:pointer;display:flex;flex-direction:column}
        .ps-item:hover{background:rgba(0,0,0,.06)}
        .ps-item.on{background:rgba(46,125,50,.12);font-weight:700}
        .ps-item small{opacity:.6;font-size:.75rem}
        .ps-add{color:var(--brand,#2e7d32);font-weight:700;border-top:1px solid rgba(0,0,0,.08);border-radius:0 0 8px 8px;margin-top:4px}
      `}</style>
    </div>
  );
}