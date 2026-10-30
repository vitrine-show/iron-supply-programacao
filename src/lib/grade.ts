export type Slot = {
  at: string | null;
  caption: number;
  programmed: boolean;
};

export type GradeMap = Record<string, Slot>;

const KEY = "iron-grade-v1";

export function loadGrade(): GradeMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<Slot>>;
    if (!parsed || typeof parsed !== "object") return {};
    const map: GradeMap = {};
    for (const [id, slot] of Object.entries(parsed)) {
      if (!slot || typeof slot !== "object") continue;
      map[id] = {
        at: typeof slot.at === "string" ? slot.at : null,
        caption: typeof slot.caption === "number" ? slot.caption : 0,
        programmed: Boolean(slot.programmed),
      };
    }
    return map;
  } catch {
    return {};
  }
}

export function saveGrade(map: GradeMap) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function parseAt(at: string): Date {
  const [date, time] = at.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function stamp(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${dayKey(date)}T${hour}:${minute}`;
}

export function phase(slot: Slot | undefined, now: Date): "aberto" | "programado" | "postado" {
  if (!slot?.programmed || !slot.at) return "aberto";
  return parseAt(slot.at).getTime() <= now.getTime() ? "postado" : "programado";
}
