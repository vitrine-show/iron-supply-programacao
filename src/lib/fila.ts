import { piecesSorted } from "@/data/catalog";

const URL = "https://uptzkgvfdycxlqnsgokl.supabase.co";
const KEY = "sb_publishable_9mJj4mF2-IJ5Y5WlSIkp7A_G9a9-f5e";

export type RobotPanel = {
  title: string;
  highlight: string;
  text: string;
  link: string;
};

export const emptyPanel: RobotPanel = { title: "", highlight: "", text: "", link: "" };

type FilaRow = { piece_id: string; position: number; released: boolean };
type PainelRow = { title: string | null; highlight: string | null; body: string | null; link: string | null };
type UltimaRow = { product_id: string; caption_index: number };

function headers(write = false): HeadersInit {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...(write ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
  };
}

export async function pullFila(): Promise<{
  order: string[];
  released: Record<string, boolean>;
  panel: RobotPanel;
  last: Record<string, number>;
}> {
  const fallback = piecesSorted.map((piece) => piece.id);
  const [filaRes, panelRes, lastRes] = await Promise.all([
    fetch(`${URL}/rest/v1/fila_iron_supply?select=piece_id,position,released&order=position.asc`, {
      headers: headers(),
    }),
    fetch(`${URL}/rest/v1/painel_robo_iron_supply?select=title,highlight,body,link&id=eq.painel`, {
      headers: headers(),
    }),
    fetch(`${URL}/rest/v1/ultima_legenda_iron_supply?select=product_id,caption_index`, {
      headers: headers(),
    }),
  ]);
  if (!filaRes.ok || !panelRes.ok || !lastRes.ok) throw new Error("Falha ao ler a fila.");

  const rows = (await filaRes.json()) as FilaRow[];
  const known = new Set(fallback);
  const saved = rows
    .filter((row) => known.has(row.piece_id))
    .sort((a, b) => a.position - b.position)
    .map((row) => row.piece_id);
  const order = [...saved, ...fallback.filter((id) => !saved.includes(id))];
  const released: Record<string, boolean> = {};
  for (const row of rows) if (row.released) released[row.piece_id] = true;

  const panelRows = (await panelRes.json()) as PainelRow[];
  const panelRow = panelRows[0];
  const panel: RobotPanel = panelRow
    ? {
        title: panelRow.title ?? "",
        highlight: panelRow.highlight ?? "",
        text: panelRow.body ?? "",
        link: panelRow.link ?? "",
      }
    : emptyPanel;

  const lastRows = (await lastRes.json()) as UltimaRow[];
  const last: Record<string, number> = {};
  for (const row of lastRows) last[row.product_id] = row.caption_index;

  return { order, released, panel, last };
}

export async function pushFila(
  order: string[],
  released: Record<string, boolean>,
  panel: RobotPanel,
) {
  const rows = order.map((id, position) => ({
    piece_id: id,
    position,
    released: Boolean(released[id]),
    updated_at: new Date().toISOString(),
  }));
  const fila = await fetch(`${URL}/rest/v1/fila_iron_supply`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(rows),
  });
  if (!fila.ok) throw new Error("Falha ao salvar a fila.");
  const painel = await fetch(`${URL}/rest/v1/painel_robo_iron_supply`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      id: "painel",
      title: panel.title,
      highlight: panel.highlight,
      body: panel.text,
      link: panel.link,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!painel.ok) throw new Error("Falha ao salvar o painel.");
}

export async function pushUltima(productId: string, caption: number) {
  const response = await fetch(`${URL}/rest/v1/ultima_legenda_iron_supply`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      product_id: productId,
      caption_index: caption,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error("Falha ao salvar a última legenda.");
}
