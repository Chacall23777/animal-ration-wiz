import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import QRCode from "qrcode";

/* ============================================================
   ARNA — Geração de relatórios profissionais (PDF + Excel)
   ============================================================ */

export type ReportVacina = {
  nome: string;
  diaIdeal: number;
  aplicadaEm?: string;
  dataPrevista: string; // ISO
};

export type ReportLote = {
  id: string;
  nome: string;
  animal: "poultry" | "swine";
  fase: string;
  proximaFase: string;
  dataEntrada: string;
  qtdInicial: number;
  qtdAtual: number;
  idadeDias: number;
  pesoInicial: number;
  pesoAtual: number;
  pesoAlvo: number;
  ganhoLabel: string;
  mortalidadePct: number;
  consumoDia: number;
  consumoSemana: number;
  consumoMes: number;
  consumoAno: number;
  racaoTotalCiclo: number;
  diasRestantes: number;
  producaoLabel: string;
  previsaoProdutiva: string;
  custoMes: number;
  receitaMes: number;
  lucroMes: number;
  proximaVacina: string;
  vacinas: ReportVacina[];
  observacoes?: string;
};

export type ReportContext = {
  produtor: string;
  email?: string;
  logoUrl: string;
  observacoes?: string;
};

const BRAND = {
  ink: [43, 36, 32] as [number, number, number],
  gold: [217, 164, 65] as [number, number, number],
  goldDeep: [178, 127, 39] as [number, number, number],
  green: [79, 121, 66] as [number, number, number],
  rust: [140, 74, 61] as [number, number, number],
  stone: [169, 160, 140] as [number, number, number],
  bg: [241, 238, 225] as [number, number, number],
  card: [233, 228, 211] as [number, number, number],
  softInk: [107, 97, 83] as [number, number, number],
};

function brl(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR");
}
function fmtDateTime(d: Date) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function loadImageDataURL(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function makeQR(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 220,
    color: { dark: "#2B2420", light: "#FFFFFF" },
  });
}

/* ================= PDF helpers ================= */

async function drawHeader(
  doc: jsPDF,
  ctx: ReportContext,
  title: string,
  subtitle: string,
  logo: string | null,
  qr: string,
) {
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND.ink);
  doc.rect(0, 0, w, 32, "F");
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, 32, w, 2, "F");

  if (logo) {
    try {
      doc.addImage(logo, "PNG", 12, 5, 22, 22);
    } catch {}
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ARNA · AGUIAR NUTRIÇÃO ANIMAL", 38, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Consultoria Rural · Nutrição Animal Inteligente", 38, 20);
  doc.setFontSize(8);
  doc.text(`Emitido em ${fmtDateTime(new Date())}`, 38, 26);

  // QR
  try {
    doc.addImage(qr, "PNG", w - 30, 4, 24, 24);
  } catch {}

  // Title band
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 12, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.softInk);
  doc.text(subtitle, 12, 52);

  // Producer block
  doc.setDrawColor(...BRAND.stone);
  doc.setLineWidth(0.3);
  doc.line(12, 56, w - 12, 56);
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.ink);
  doc.text(`Produtor: ${ctx.produtor || "—"}`, 12, 62);
  if (ctx.email) doc.text(ctx.email, w - 12, 62, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.softInk);
    doc.text("ARNA · relatório gerado automaticamente — valide dados com um zootecnista", 12, h - 6);
    doc.text(`Pág. ${i}/${pages}`, w - 12, h - 6, { align: "right" });
  }
}

function drawBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  data: { label: string; value: number; color: [number, number, number] }[],
  opts: { title: string; formatter?: (v: number) => string },
) {
  const fmt = opts.formatter ?? ((v) => String(Math.round(v)));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.ink);
  doc.text(opts.title, x, y);

  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const rowH = 8;
  const labelW = 44;
  const valW = 34;
  const barW = width - labelW - valW;
  let cy = y + 4;
  data.forEach((d) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.ink);
    doc.text(d.label, x, cy + 5);
    const w = Math.max(1, (Math.abs(d.value) / max) * barW);
    doc.setFillColor(...d.color);
    doc.roundedRect(x + labelW, cy + 1, w, rowH - 3, 1, 1, "F");
    doc.setTextColor(...BRAND.softInk);
    doc.text(fmt(d.value), x + width, cy + 5, { align: "right" });
    cy += rowH;
  });
}

/* ================= PDF: 1 lote ================= */

export async function exportLotePDF(
  lote: ReportLote,
  ctx: ReportContext,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadImageDataURL(ctx.logoUrl);
  const qr = await makeQR(
    `ARNA · ${ctx.produtor} · Lote ${lote.nome} · ${new Date().toISOString().slice(0, 10)}`,
  );

  await drawHeader(
    doc,
    ctx,
    `Relatório do Lote — ${lote.nome}`,
    `${lote.animal === "poultry" ? "Aves" : "Suínos"} · ${lote.fase} · entrada ${fmtDate(lote.dataEntrada)}`,
    logo,
    qr,
  );

  autoTable(doc, {
    startY: 68,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2, textColor: BRAND.ink, lineColor: [220, 214, 195] },
    headStyles: { fillColor: BRAND.ink, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 46, fillColor: BRAND.bg },
      1: {},
      2: { fontStyle: "bold", cellWidth: 46, fillColor: BRAND.bg },
      3: {},
    },
    head: [["Indicador", "Valor", "Indicador", "Valor"]],
    body: [
      ["Animais vivos", `${lote.qtdAtual} / ${lote.qtdInicial}`, "Idade", `${lote.idadeDias} dias`],
      ["Peso inicial", `${lote.pesoInicial.toFixed(2)} kg`, "Peso atual (est.)", `${lote.pesoAtual.toFixed(2)} kg`],
      ["Peso final previsto", `${lote.pesoAlvo.toFixed(2)} kg`, "Ganho de peso", lote.ganhoLabel],
      ["Mortalidade média", `${lote.mortalidadePct.toFixed(1)}%`, "Dias restantes", `${lote.diasRestantes} dias`],
      ["Consumo diário", `${lote.consumoDia.toFixed(1)} kg`, "Consumo semanal", `${lote.consumoSemana.toFixed(0)} kg`],
      ["Consumo mensal", `${lote.consumoMes.toFixed(0)} kg`, "Consumo anual", `${lote.consumoAno.toFixed(0)} kg`],
      ["Ração total do ciclo", `${lote.racaoTotalCiclo.toFixed(0)} kg`, "Produção", lote.producaoLabel],
      ["Previsão produtiva", lote.previsaoProdutiva, "Próxima fase", lote.proximaFase],
      ["Custo ração/mês", brl(lote.custoMes), "Receita/mês", brl(lote.receitaMes)],
      ["Lucro estimado/mês", brl(lote.lucroMes), "Próxima vacina", lote.proximaVacina],
    ],
  });

  let y = (doc as any).lastAutoTable.finalY + 8;

  // Gráficos
  drawBarChart(
    doc,
    12,
    y,
    88,
    [
      { label: "Custo", value: lote.custoMes, color: BRAND.rust },
      { label: "Receita", value: lote.receitaMes, color: BRAND.green },
      { label: "Lucro", value: lote.lucroMes, color: BRAND.goldDeep },
    ],
    { title: "Financeiro do mês", formatter: brl },
  );
  drawBarChart(
    doc,
    110,
    y,
    88,
    [
      { label: "Diário", value: lote.consumoDia, color: BRAND.gold },
      { label: "Semanal", value: lote.consumoSemana, color: BRAND.goldDeep },
      { label: "Mensal", value: lote.consumoMes, color: BRAND.rust },
    ],
    { title: "Consumo de ração (kg)", formatter: (v) => `${v.toFixed(0)} kg` },
  );

  y += 40;

  // Vacinas
  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: BRAND.goldDeep, textColor: [255, 255, 255] },
    head: [["Vacina", "Dia ideal", "Data prevista", "Status"]],
    body: lote.vacinas.map((v) => [
      v.nome,
      `dia ${v.diaIdeal}`,
      fmtDate(v.dataPrevista),
      v.aplicadaEm ? `Aplicada em ${fmtDate(v.aplicadaEm)}` : "Pendente",
    ]),
  });

  y = (doc as any).lastAutoTable.finalY + 6;
  const obs = lote.observacoes || ctx.observacoes || "";
  if (obs) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.ink);
    doc.text("Observações", 12, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.softInk);
    const wrapped = doc.splitTextToSize(obs, doc.internal.pageSize.getWidth() - 24);
    doc.text(wrapped, 12, y + 5);
  }

  drawFooter(doc);
  return doc.output("blob");
}

/* ================= PDF: plantel inteiro ================= */

export async function exportPlantelPDF(
  lotes: ReportLote[],
  ctx: ReportContext,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const logo = await loadImageDataURL(ctx.logoUrl);
  const qr = await makeQR(
    `ARNA · ${ctx.produtor} · Plantel · ${new Date().toISOString().slice(0, 10)}`,
  );

  await drawHeader(
    doc,
    ctx,
    "Relatório Consolidado do Plantel",
    `${lotes.length} lote(s) · totais e indicadores por lote`,
    logo,
    qr,
  );

  const totCusto = lotes.reduce((s, l) => s + l.custoMes, 0);
  const totReceita = lotes.reduce((s, l) => s + l.receitaMes, 0);
  const totLucro = lotes.reduce((s, l) => s + l.lucroMes, 0);
  const totAnimais = lotes.reduce((s, l) => s + l.qtdAtual, 0);
  const totConsumoMes = lotes.reduce((s, l) => s + l.consumoMes, 0);

  autoTable(doc, {
    startY: 68,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND.ink, textColor: [255, 255, 255], fontStyle: "bold" },
    head: [[
      "Lote", "Espécie", "Fase", "Animais", "Idade", "Peso atual",
      "Consumo/mês", "Custo/mês", "Receita/mês", "Lucro/mês", "Próx. vacina",
    ]],
    body: lotes.map((l) => [
      l.nome,
      l.animal === "poultry" ? "Aves" : "Suínos",
      l.fase,
      `${l.qtdAtual}`,
      `${l.idadeDias}d`,
      `${l.pesoAtual.toFixed(2)}kg`,
      `${l.consumoMes.toFixed(0)}kg`,
      brl(l.custoMes),
      brl(l.receitaMes),
      brl(l.lucroMes),
      l.proximaVacina,
    ]),
    foot: [[
      "Totais", "", "", `${totAnimais}`, "", "",
      `${totConsumoMes.toFixed(0)}kg`, brl(totCusto), brl(totReceita), brl(totLucro), "",
    ]],
    footStyles: { fillColor: BRAND.card, textColor: BRAND.ink, fontStyle: "bold" },
  });

  let y = (doc as any).lastAutoTable.finalY + 8;
  drawBarChart(
    doc,
    14,
    y,
    130,
    [
      { label: "Custo total", value: totCusto, color: BRAND.rust },
      { label: "Receita total", value: totReceita, color: BRAND.green },
      { label: "Lucro total", value: totLucro, color: BRAND.goldDeep },
    ],
    { title: "Resultado financeiro consolidado", formatter: brl },
  );

  drawBarChart(
    doc,
    155,
    y,
    130,
    lotes.slice(0, 6).map((l, i) => ({
      label: l.nome.length > 12 ? l.nome.slice(0, 12) + "…" : l.nome,
      value: l.consumoMes,
      color: i % 2 === 0 ? BRAND.gold : BRAND.goldDeep,
    })),
    { title: "Consumo mensal por lote (kg)", formatter: (v) => `${v.toFixed(0)} kg` },
  );

  if (ctx.observacoes) {
    y += 42;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Observações", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.softInk);
    doc.text(
      doc.splitTextToSize(ctx.observacoes, doc.internal.pageSize.getWidth() - 28),
      14,
      y + 5,
    );
  }

  drawFooter(doc);
  return doc.output("blob");
}

/* ================= Excel ================= */

function loteRows(l: ReportLote) {
  return [
    ["Lote", l.nome],
    ["Espécie", l.animal === "poultry" ? "Aves" : "Suínos"],
    ["Fase", l.fase],
    ["Próxima fase", l.proximaFase],
    ["Data de entrada", fmtDate(l.dataEntrada)],
    ["Animais inicial", l.qtdInicial],
    ["Animais vivos", l.qtdAtual],
    ["Idade (dias)", l.idadeDias],
    ["Peso inicial (kg)", l.pesoInicial],
    ["Peso atual (kg)", l.pesoAtual],
    ["Peso final previsto (kg)", l.pesoAlvo],
    ["Ganho de peso", l.ganhoLabel],
    ["Mortalidade média (%)", l.mortalidadePct],
    ["Consumo diário (kg)", l.consumoDia],
    ["Consumo semanal (kg)", l.consumoSemana],
    ["Consumo mensal (kg)", l.consumoMes],
    ["Consumo anual (kg)", l.consumoAno],
    ["Ração total do ciclo (kg)", l.racaoTotalCiclo],
    ["Dias restantes", l.diasRestantes],
    ["Produção", l.producaoLabel],
    ["Previsão produtiva", l.previsaoProdutiva],
    ["Custo ração/mês (R$)", l.custoMes],
    ["Receita/mês (R$)", l.receitaMes],
    ["Lucro estimado/mês (R$)", l.lucroMes],
    ["Próxima vacina", l.proximaVacina],
  ] as (string | number)[][];
}

function makeMetaSheet(ctx: ReportContext, title: string) {
  return XLSX.utils.aoa_to_sheet([
    ["ARNA · AGUIAR NUTRIÇÃO ANIMAL"],
    ["Relatório", title],
    ["Produtor", ctx.produtor],
    ["E-mail", ctx.email ?? ""],
    ["Emitido em", fmtDateTime(new Date())],
    [],
    ["Observações", ctx.observacoes ?? ""],
  ]);
}

export function exportLoteXLSX(lote: ReportLote, ctx: ReportContext): Blob {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeMetaSheet(ctx, `Lote ${lote.nome}`), "Capa");

  const wsInd = XLSX.utils.aoa_to_sheet([["Indicador", "Valor"], ...loteRows(lote)]);
  XLSX.utils.book_append_sheet(wb, wsInd, "Indicadores");

  const wsVac = XLSX.utils.aoa_to_sheet([
    ["Vacina", "Dia ideal", "Data prevista", "Aplicada em", "Status"],
    ...lote.vacinas.map((v) => [
      v.nome, v.diaIdeal, fmtDate(v.dataPrevista),
      v.aplicadaEm ? fmtDate(v.aplicadaEm) : "",
      v.aplicadaEm ? "Aplicada" : "Pendente",
    ]),
  ]);
  XLSX.utils.book_append_sheet(wb, wsVac, "Vacinas");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function exportPlantelXLSX(lotes: ReportLote[], ctx: ReportContext): Blob {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, makeMetaSheet(ctx, "Plantel consolidado"), "Capa");

  const header = [
    "Lote", "Espécie", "Fase", "Data entrada", "Animais vivos", "Idade (d)",
    "Peso atual (kg)", "Peso alvo (kg)", "Ganho", "Mortalidade (%)",
    "Consumo dia (kg)", "Consumo semana (kg)", "Consumo mês (kg)", "Consumo ano (kg)",
    "Ração ciclo (kg)", "Produção", "Prev. produtiva",
    "Custo mês (R$)", "Receita mês (R$)", "Lucro mês (R$)", "Próxima vacina",
  ];
  const rows = lotes.map((l) => [
    l.nome, l.animal === "poultry" ? "Aves" : "Suínos", l.fase, fmtDate(l.dataEntrada),
    l.qtdAtual, l.idadeDias, l.pesoAtual, l.pesoAlvo, l.ganhoLabel, l.mortalidadePct,
    l.consumoDia, l.consumoSemana, l.consumoMes, l.consumoAno,
    l.racaoTotalCiclo, l.producaoLabel, l.previsaoProdutiva,
    l.custoMes, l.receitaMes, l.lucroMes, l.proximaVacina,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Plantel");

  const vac = [["Lote", "Vacina", "Dia ideal", "Data prevista", "Aplicada em", "Status"]];
  lotes.forEach((l) =>
    l.vacinas.forEach((v) =>
      vac.push([
        l.nome, v.nome, String(v.diaIdeal), fmtDate(v.dataPrevista),
        v.aplicadaEm ? fmtDate(v.aplicadaEm) : "",
        v.aplicadaEm ? "Aplicada" : "Pendente",
      ]),
    ),
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vac), "Vacinas");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ================= Ações: baixar / compartilhar / imprimir ================= */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function shareBlob(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean;
    share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title, text: title });
      return true;
    } catch {
      /* usuário cancelou */
    }
  }
  downloadBlob(blob, filename);
  return false;
}

export function printPDFBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    downloadBlob(blob, "arna-relatorio.pdf");
    return;
  }
  win.addEventListener("load", () => {
    try {
      win.focus();
      win.print();
    } catch {}
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "arna";
}