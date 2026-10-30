import { piecesSorted } from "@/data/catalog";
import type { GradeMap, Slot } from "@/lib/grade";

const URL = "https://uptzkgvfdycxlqnsgokl.supabase.co";
const KEY = "sb_publishable_9mJj4mF2-IJ5Y5WlSIkp7A_G9a9-f5e";

type Row = {
  piece_id: string;
  scheduled_at: string | null;
  caption_index: number | null;
  programmed: boolean | null;
};

function headers(write = false): HeadersInit {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    ...(write ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
  };
}

function slotOf(row: Row): Slot {
  return {
    at: row.scheduled_at,
    caption: row.caption_index ?? 0,
    programmed: Boolean(row.programmed),
    chosen: false,
  };
}

export async function pullProgramacao(): Promise<GradeMap> {
  const response = await fetch(
    `${URL}/rest/v1/programacao_iron_supply?select=piece_id,scheduled_at,caption_index,programmed`,
    { headers: headers() },
  );
  if (!response.ok) throw new Error("Falha ao ler a programação.");
  const rows = (await response.json()) as Row[];
  const map: GradeMap = {};
  for (const row of rows) map[row.piece_id] = slotOf(row);
  return map;
}

export async function pushProgramacao(map: GradeMap) {
  const rows = piecesSorted.map((piece) => {
    const slot = map[piece.id];
    return {
      piece_id: piece.id,
      scheduled_at: slot?.at ?? null,
      caption_index: slot?.caption ?? 0,
      programmed: Boolean(slot?.programmed),
      updated_at: new Date().toISOString(),
    };
  });
  const response = await fetch(`${URL}/rest/v1/programacao_iron_supply`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error("Falha ao salvar a programação.");
}
