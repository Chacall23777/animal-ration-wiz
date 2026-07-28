/* ============================================================
   ARNA — Catálogo extensível de espécies
   Adicionar bovinos/caprinos/ovinos/peixes no futuro só requer
   trocar `available: false` por `true` e preencher `phases`.
   ============================================================ */

export type SpeciesKey =
  | "poultry"
  | "swine"
  | "bovine"
  | "caprine"
  | "ovine"
  | "fish";

export type SpeciesEntry = {
  key: SpeciesKey;
  label: string;
  emoji: string;
  categories: string[]; // ex: matrizes, leitões, crescimento...
  available: boolean;
  soon?: string; // texto "em breve"
};

export const SPECIES: SpeciesEntry[] = [
  {
    key: "poultry",
    label: "Aves",
    emoji: "🐓",
    categories: ["Poedeiras", "Frangos de corte", "Pintinhos", "Galos", "Matrizes"],
    available: true,
  },
  {
    key: "swine",
    label: "Suínos",
    emoji: "🐖",
    categories: ["Matrizes", "Leitões", "Crescimento", "Terminação", "Reprodutores"],
    available: true,
  },
  {
    key: "bovine",
    label: "Bovinos",
    emoji: "🐄",
    categories: ["Leite", "Corte", "Bezerros", "Matrizes", "Reprodutores"],
    available: false,
    soon: "Em breve · confinamento, leite e corte",
  },
  {
    key: "caprine",
    label: "Caprinos",
    emoji: "🐐",
    categories: ["Leite", "Corte", "Matrizes", "Reprodutores"],
    available: false,
    soon: "Em breve",
  },
  {
    key: "ovine",
    label: "Ovinos",
    emoji: "🐑",
    categories: ["Leite", "Corte", "Matrizes", "Reprodutores"],
    available: false,
    soon: "Em breve",
  },
  {
    key: "fish",
    label: "Peixes",
    emoji: "🐟",
    categories: ["Tilápia", "Tambaqui", "Pintado"],
    available: false,
    soon: "Em breve · piscicultura",
  },
];

export const AVAILABLE_SPECIES = SPECIES.filter((s) => s.available);
export const SOON_SPECIES = SPECIES.filter((s) => !s.available);