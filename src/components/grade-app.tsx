import { memo, useCallback, useEffect, useState } from "react";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, LayoutGrid, List, X } from "lucide-react";
import {
  defaultCaptionIndex,
  piecesSorted,
  productById,
  type Piece,
} from "@/data/catalog";
import { dayKey, loadGrade, phase, saveGrade, stamp, type GradeMap, type Slot } from "@/lib/grade";
import { pullProgramacao, pushProgramacao } from "@/lib/programacao";
import { emptyPanel, pullFila, pushFila, pushUltima, type RobotPanel } from "@/lib/fila";

const STORY_LINK = "https://wa.me/5531988551275";
const STORY_NAME = "FAÇA SEU PEDIDO PELO WHATSAPP";

type CalendarView = "semana" | "dia";

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function driveId(src: string) {
  return src.split("/d/")[1]?.split(/[?#=]/)[0] ?? "";
}

function thumb(src: string, width: number) {
  const id = driveId(src);
  return id ? `https://lh3.googleusercontent.com/d/${id}=w${width}` : src;
}

function whenLabel(at: string | null | undefined) {
  if (!at || at.length < 16) return "";
  return `${at.slice(8, 10)}/${at.slice(5, 7)} · ${at.slice(11, 16)}`;
}

function firstCaption(piece: Piece, stored: number | undefined) {
  const posts = piecesSorted.filter(
    (item) => item.product === piece.product && item.format === "post",
  );
  const spread = Math.max(0, posts.findIndex((item) => item.id === piece.id));
  const total = productById(piece.product).captions.length;
  const legacy = total ? spread % total : 0;
  if (stored == null || (legacy !== 0 && stored === legacy)) return 0;
  return stored;
}

function captionOf(piece: Piece, map: GradeMap) {
  const product = productById(piece.product);
  const total = product.captions.length;
  const stored = map[piece.id]?.caption;
  const index = stored ?? defaultCaptionIndex(piece);
  const safe = total ? ((index % total) + total) % total : 0;
  return { product, index: safe, text: product.captions[safe] ?? "", total };
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    await writeClipboard(text);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
  }
  return { copied, copy };
}

export function GradeApp({ cardId = null, robo = false }: { cardId?: string | null; robo?: boolean }) {
  const [map, setMap] = useState<GradeMap>({});
  const [today, setToday] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);
  const [layout, setLayout] = useState<"lista" | "grade">("lista");
  const [filtro, setFiltro] = useState<"story" | "post" | "tudo">("tudo");
  const [view, setView] = useState<CalendarView>("semana");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [filaReady, setFilaReady] = useState(false);
  const [order, setOrder] = useState<string[]>(() => piecesSorted.map((piece) => piece.id));
  const [released, setReleased] = useState<Record<string, boolean>>({});
  const [panel, setPanel] = useState<RobotPanel>(emptyPanel);
  const [lastCaption, setLastCaption] = useState<Record<string, number>>({});
  const closeDetail = useCallback(() => setOpenId(null), []);
  const openPieceById = useCallback((id: string) => setOpenId(id), []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday((prev) => {
        const next = new Date();
        if (
          prev &&
          prev.getFullYear() === next.getFullYear() &&
          prev.getMonth() === next.getMonth() &&
          prev.getDate() === next.getDate() &&
          prev.getHours() === next.getHours() &&
          prev.getMinutes() === next.getMinutes()
        ) {
          return prev;
        }
        return next;
      });
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancel = false;
    const now = new Date();
    const local = loadGrade();
    void (async () => {
      let remote: GradeMap = {};
      try {
        remote = await pullProgramacao();
      } catch {
        remote = {};
      }
      if (cancel) return;
      const next: GradeMap = { ...local, ...remote };
      for (const piece of piecesSorted) {
        const slot = next[piece.id];
        const programmed = Boolean(slot?.programmed);
        next[piece.id] = {
          at: programmed && slot?.at ? slot.at : null,
          caption: firstCaption(piece, slot?.caption),
          programmed,
          chosen: Boolean(local[piece.id]?.chosen),
        };
      }
      setMap(next);
      setToday(now);
      setCursor(now);
      setSynced(true);
      try {
        const fila = await pullFila();
        if (cancel) return;
        setOrder(fila.order);
        setReleased(fila.released);
        setPanel(fila.panel);
        setLastCaption(fila.last);
      } catch {
        // A fila nova pode falhar sem apagar a programação.
      }
      if (!cancel) setFilaReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!synced) return;
    saveGrade(map);
    const timer = window.setTimeout(() => {
      void pushProgramacao(map).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [map, synced]);

  useEffect(() => {
    if (!filaReady) return;
    const timer = window.setTimeout(() => {
      void pushFila(order, released, panel).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [order, released, panel, filaReady]);

  function patch(id: string, next: Partial<{ at: string | null; caption: number; programmed: boolean; chosen: boolean }>) {
    setMap((current) => {
      const piece = piecesSorted.find((item) => item.id === id);
      const prev = current[id] ?? {
        at: null,
        caption: piece ? defaultCaptionIndex(piece) : 0,
        programmed: false,
        chosen: false,
      };
      return { ...current, [id]: { ...prev, ...next } };
    });
  }

  function setWhen(id: string, at: string) {
    patch(id, { at, programmed: false });
  }

  function movePiece(id: string, dir: -1 | 1) {
    setOrder((current) => {
      const index = current.indexOf(id);
      const to = index + dir;
      if (index < 0 || to < 0 || to >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function chooseCaption(piece: Piece, caption: number) {
    patch(piece.id, { caption });
    setLastCaption((current) => ({ ...current, [piece.product]: caption }));
    void pushUltima(piece.product, caption).catch(() => undefined);
  }

  const openPiece = piecesSorted.find((piece) => piece.id === openId) ?? null;
  const solo = cardId ? piecesSorted.find((piece) => piece.id === cardId) ?? null : null;
  const ordered = order
    .map((id) => piecesSorted.find((piece) => piece.id === id))
    .filter((piece): piece is Piece => Boolean(piece))
    .filter((piece) => filtro === "tudo" || piece.format === filtro);

  if (robo) {
    return (
      <RoboScreen
        order={order}
        released={released}
        panel={panel}
        map={map}
        onProgram={(id) => patch(id, { programmed: true })}
      />
    );
  }

  if (solo) {
    return (
      <main className="bg-ink text-fg">
        <SoloCard piece={solo} slot={map[solo.id]} />
      </main>
    );
  }

  return (
    <main className="bg-ink text-fg">
      <div className="fixed inset-x-0 top-0 z-30 border-b border-line bg-ink">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl uppercase leading-none tracking-wide">Programação</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Lista"
                aria-pressed={layout === "lista"}
                onClick={() => setLayout("lista")}
                className={layout === "lista" ? "icon on" : "icon"}
              >
                <List aria-hidden="true" size={18} />
              </button>
              <button
                type="button"
                aria-label="Grade"
                aria-pressed={layout === "grade"}
                onClick={() => setLayout("grade")}
                className={layout === "grade" ? "icon on" : "icon"}
              >
                <LayoutGrid aria-hidden="true" size={18} />
              </button>
              <button
                type="button"
                aria-label="Calendário"
                onClick={() => setCalendarOpen(true)}
                className="icon"
              >
                <Calendar aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {(
              [
                ["story", "Story"],
                ["post", "Post"],
                ["tudo", "Tudo"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={filtro === id ? "chip chip-flame" : "chip"}
              >
                {label}
              </button>
            ))}
            <a className="chip ml-auto" href="/?robo=1">
              Robô
            </a>
            <button
              type="button"
              className="chip"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              Subir
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-12">
        <img src="/marca.png" alt="Iron Supply" className="mx-auto h-14 w-auto" />

        <section className="mt-6 rounded-xl bg-surface p-3">
          <h2 className="text-sm">Painel do robô</h2>
          <p className="mt-1 text-xs text-muted">Se ficar vazio, não aparece para ele.</p>
          <label className="mt-3 block text-xs text-muted">
            Título
            <input
              value={panel.title}
              onChange={(event) => setPanel((current) => ({ ...current, title: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            Destaque
            <input
              value={panel.highlight}
              onChange={(event) => setPanel((current) => ({ ...current, highlight: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            Texto
            <textarea
              value={panel.text}
              rows={3}
              onChange={(event) => setPanel((current) => ({ ...current, text: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-ink px-2 py-2 text-base text-fg"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            Link
            <input
              value={panel.link}
              onChange={(event) => setPanel((current) => ({ ...current, link: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
            />
          </label>
        </section>

        <div className="mt-6">
          {layout === "grade" ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {ordered.map((piece) => (
                <li key={piece.id}>
                  <PieceThumb piece={piece} slot={map[piece.id]} now={today} onOpen={openPieceById} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-6">
              {ordered.map((piece) => {
                const index = order.indexOf(piece.id);
                return (
                  <li key={piece.id}>
                    <PieceRow
                      piece={piece}
                      slot={map[piece.id]}
                      now={today}
                      released={Boolean(released[piece.id])}
                      lastCaption={lastCaption[piece.product]}
                      canUp={index > 0}
                      canDown={index >= 0 && index < order.length - 1}
                      onAt={(at) => setWhen(piece.id, at)}
                      onProgram={() => patch(piece.id, { programmed: true })}
                      onUndo={() => patch(piece.id, { programmed: false })}
                      onCaption={(caption) => chooseCaption(piece, caption)}
                      onRelease={() =>
                        setReleased((current) => ({ ...current, [piece.id]: !current[piece.id] }))
                      }
                      onUp={() => movePiece(piece.id, -1)}
                      onDown={() => movePiece(piece.id, 1)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {calendarOpen && cursor && (
        <CalendarSheet
          cursor={cursor}
          today={today}
          view={view}
          map={map}
          onCursor={setCursor}
          onView={setView}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {openPiece && (
        <PieceDetail
          piece={openPiece}
          map={map}
          onAt={(at) => setWhen(openPiece.id, at)}
          onProgram={() => patch(openPiece.id, { programmed: true })}
          onUndo={() => patch(openPiece.id, { programmed: false })}
          now={today}
          onCaption={(caption) => chooseCaption(openPiece, caption)}
          onClose={closeDetail}
        />
      )}
    </main>
  );
}

function SoloCard({ piece, slot }: { piece: Piece; slot: Slot | undefined }) {
  const { product, text } = captionOf(piece, slot ? { [piece.id]: slot } : {});
  const isStory = piece.format === "story";
  return (
    <article className="mx-auto max-w-2xl px-4 py-6">
      <img
        src={piece.image}
        alt={`${product.name}, ${isStory ? "story" : "post"}`}
        width={piece.w}
        height={piece.h}
        decoding="async"
        className="block h-auto w-full bg-ink object-contain"
        style={{ aspectRatio: `${piece.w} / ${piece.h}` }}
      />
      <p className="mt-4 text-sm">{product.name}</p>
      {isStory ? (
        <div className="mt-3">
          <p className="text-sm">Adesivo de personalização de link para story</p>
          <p className="mt-1 break-all text-sm">{STORY_LINK}</p>
          <p className="mt-1 text-sm">{STORY_NAME}</p>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      )}
    </article>
  );
}

function piecesOn(day: Date, map: GradeMap) {
  const key = dayKey(day);
  return piecesSorted
    .filter((piece) => {
      const slot = map[piece.id];
      return Boolean(slot?.programmed) && slot?.at?.slice(0, 10) === key;
    })
    .sort((a, b) => {
      const byTime = (map[a.id]?.at ?? "").localeCompare(map[b.id]?.at ?? "");
      if (byTime) return byTime;
      if (a.format !== b.format) return a.format === "story" ? -1 : 1;
      return a.id.localeCompare(b.id, "pt");
    });
}

function CalendarSheet({
  cursor,
  today,
  view,
  map,
  onCursor,
  onView,
  onClose,
}: {
  cursor: Date;
  today: Date | null;
  view: CalendarView;
  map: GradeMap;
  onCursor: (day: Date) => void;
  onView: (view: CalendarView) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const days =
    view === "semana"
      ? Array.from({ length: 7 }, (_, index) =>
          addDays(startOfWeek(cursor, { weekStartsOn: 1 }), index),
        )
      : [cursor];
  const title =
    view === "semana"
      ? `${format(days[0], "d MMM", { locale: ptBR })} a ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "d MMM", { locale: ptBR })}`
      : cap(format(cursor, "EEEE, d 'de' MMMM", { locale: ptBR }));
  const step = view === "semana" ? 7 : 1;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink">
      <div className="sticky top-0 z-10 border-b border-line bg-ink px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="font-display uppercase tracking-wide">Calendário</p>
          <button type="button" aria-label="Fechar" onClick={onClose} className="icon">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl gap-4">
          {(["semana", "dia"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onView(item)}
              className={view === item ? "text-sm text-fg" : "text-sm text-muted"}
            >
              {item === "semana" ? "Semana" : "Dia"}
            </button>
          ))}
        </div>
        <div className="mx-auto mt-1 flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            aria-label={view === "semana" ? "Semana anterior" : "Dia anterior"}
            onClick={() => onCursor(addDays(cursor, -step))}
            className="icon"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <p className="text-center text-sm">{title}</p>
          <button
            type="button"
            aria-label={view === "semana" ? "Próxima semana" : "Próximo dia"}
            onClick={() => onCursor(addDays(cursor, step))}
            className="icon"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      </div>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6">
        {days.map((day) => {
          const items = piecesOn(day, map);
          const isToday = today ? isSameDay(day, today) : false;
          return (
            <section key={dayKey(day)} aria-label={format(day, "d MMMM", { locale: ptBR })}>
              <h2
                className={
                  isToday
                    ? "font-display text-lg uppercase tracking-wide text-flame"
                    : "font-display text-lg uppercase tracking-wide"
                }
              >
                {cap(format(day, "EEEE, d 'de' MMMM", { locale: ptBR }))}
              </h2>
              {items.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Nada neste dia.</p>
              ) : (
                <ul className={view === "dia" ? "mt-4 flex flex-col gap-6" : "mt-3 flex flex-col gap-4"}>
                  {items.map((piece) => {
                    const product = productById(piece.product);
                    const time = map[piece.id]?.at?.slice(11, 16) ?? "";
                    return (
                      <li key={piece.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                        <div className="flex items-center justify-center bg-ink px-3 py-3">
                          <img
                            src={thumb(piece.image, view === "dia" ? 1200 : 640)}
                            alt={`${product.name}, ${piece.format === "story" ? "story" : "post"}`}
                            loading="lazy"
                            decoding="async"
                            className={
                              view === "dia"
                                ? "max-h-[70vh] w-auto max-w-full object-contain"
                                : "max-h-56 w-auto max-w-full object-contain"
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium">{product.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                              {piece.format === "story" ? "Story" : "Post"}
                            </p>
                          </div>
                          <p className="text-sm">{time}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex items-center justify-center bg-ink px-3 py-3">
      <img src={src} alt={alt} decoding="async" className="h-auto w-full object-contain" />
    </div>
  );
}

function DownloadLink({ href }: { href: string }) {
  const id = href.split("/d/")[1]?.split(/[?#]/)[0];
  const file = id ? `https://drive.google.com/uc?export=download&id=${id}` : href;
  return (
    <a href={file} className="chip">
      Baixar
    </a>
  );
}

function CopyButton({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
    >
      {done ? "Copiado" : label}
    </button>
  );
}

function CaptionSwitch({
  index,
  total,
  onCaption,
}: {
  index: number;
  total: number;
  onCaption: (caption: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Legenda anterior"
        onClick={() => onCaption((index - 1 + total) % total)}
        className="icon"
      >
        <ChevronLeft aria-hidden="true" size={18} />
      </button>
      <p className="text-sm text-muted">
        Legenda {index + 1} de {total}
      </p>
      <button
        type="button"
        aria-label="Próxima legenda"
        onClick={() => onCaption((index + 1) % total)}
        className="icon"
      >
        <ChevronRight aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

function StoryBlock() {
  const { copied, copy } = useCopy();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Adesivo de personalização de link para story</p>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Link</p>
        <p className="mt-1 break-all text-sm">{STORY_LINK}</p>
      </div>
      <CopyButton
        label="Copiar link"
        done={copied === "link"}
        onClick={() => copy("link", STORY_LINK)}
      />
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Nome personalizado</p>
        <p className="mt-1 text-sm">{STORY_NAME}</p>
      </div>
      <CopyButton
        label="Copiar nome"
        done={copied === "name"}
        onClick={() => copy("name", STORY_NAME)}
      />
    </div>
  );
}

function ProgramControl({
  slot,
  now,
  onProgram,
  onUndo,
}: {
  slot: Slot | undefined;
  now: Date | null;
  onProgram: () => void;
  onUndo: () => void;
}) {
  const state = phase(slot, now ?? new Date());
  if (state === "aberto") {
    return (
      <button type="button" onClick={onProgram} className="chip">
        Programar
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <p className="chip chip-flame">{state === "postado" ? "Postado" : "Programado"}</p>
      <button type="button" onClick={onUndo} className="chip">
        Voltar
      </button>
    </div>
  );
}

const PieceThumb = memo(function PieceThumb({
  piece,
  slot,
  now,
  onOpen,
}: {
  piece: Piece;
  slot: Slot | undefined;
  now: Date | null;
  onOpen: (id: string) => void;
}) {
  const product = productById(piece.product);
  const state = phase(slot, now ?? new Date());
  const isStory = piece.format === "story";
  return (
    <button type="button" onClick={() => onOpen(piece.id)} className="w-full text-left">
      <span className="flex h-52 items-center justify-center">
        <img
          src={thumb(piece.image, 480)}
          alt={`${product.name}, ${isStory ? "story" : "post"}`}
          width={piece.w}
          height={piece.h}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
      </span>
      <span className="mt-2 block text-xs">{product.name}</span>
      <span className="mt-0.5 block text-xs text-muted">
        {isStory ? "Story" : "Post"}
        {state === "aberto" ? "" : state === "postado" ? " · Postado" : " · Programado"}
      </span>
    </button>
  );
});

const PieceRow = memo(function PieceRow({
  piece,
  slot,
  now,
  released,
  lastCaption,
  canUp,
  canDown,
  onAt,
  onProgram,
  onUndo,
  onCaption,
  onRelease,
  onUp,
  onDown,
}: {
  piece: Piece;
  slot: Slot | undefined;
  now: Date | null;
  released: boolean;
  lastCaption: number | undefined;
  canUp: boolean;
  canDown: boolean;
  onAt: (at: string) => void;
  onProgram: () => void;
  onUndo: () => void;
  onCaption: (caption: number) => void;
  onRelease: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const { product, index, text, total } = captionOf(piece, slot ? { [piece.id]: slot } : {});
  const { copied, copy } = useCopy();
  const isStory = piece.format === "story";

  return (
    <article className="rounded-xl bg-surface p-3">
      <img
        src={piece.image}
        alt={`${product.name}, ${isStory ? "story" : "post"}`}
        width={piece.w}
        height={piece.h}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full bg-ink object-contain"
        style={{ aspectRatio: `${piece.w} / ${piece.h}` }}
      />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-sm">{product.name}</p>
        <p className="text-xs uppercase tracking-wide text-muted">{isStory ? "Story" : "Post"}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DownloadLink href={piece.image} />
        {isStory ? (
          <>
            <CopyButton label="Copiar link" done={copied === "link"} onClick={() => copy("link", STORY_LINK)} />
            <CopyButton label="Copiar nome" done={copied === "name"} onClick={() => copy("name", STORY_NAME)} />
          </>
        ) : (
          <CopyButton label="Copiar legenda" done={copied === "caption"} onClick={() => copy("caption", text)} />
        )}
        <button
          type="button"
          className="chip"
          onClick={() => {
            const url = new URL(window.location.origin + window.location.pathname);
            url.searchParams.set("card", piece.id);
            const shareText = isStory ? `${STORY_LINK}\n${STORY_NAME}` : text;
            void (async () => {
              try {
                if (navigator.share) {
                  await navigator.share({
                    title: product.name,
                    text: shareText,
                    url: url.toString(),
                  });
                  return;
                }
              } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") return;
              }
              await copy("card", url.toString());
            })();
          }}
        >
          {copied === "card" ? "Link copiado" : "Encaminhar"}
        </button>
      </div>
      {isStory ? (
        <div className="mt-3">
          <p className="text-sm">Adesivo de personalização de link para story</p>
          <p className="mt-1 break-all text-sm text-muted">{STORY_LINK}</p>
          <p className="mt-1 text-sm">{STORY_NAME}</p>
        </div>
      ) : (
        <div className="mt-3">
          <CaptionPanel index={index} total={total} text={text} lastCaption={lastCaption} onCaption={onCaption} />
        </div>
      )}
      <div className="mt-3">
        <WhenFields at={slot?.at ?? null} now={now} onAt={onAt} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="chip" onClick={onUp} disabled={!canUp}>
          Subir
        </button>
        <button type="button" className="chip" onClick={onDown} disabled={!canDown}>
          Descer
        </button>
        <button type="button" className={released ? "chip chip-flame" : "chip"} onClick={onRelease}>
          {released ? "Liberado" : "Liberar"}
        </button>
      </div>
      <div className="mt-3">
        <ProgramControl slot={slot} now={now} onProgram={onProgram} onUndo={onUndo} />
      </div>
    </article>
  );
});

function CaptionPanel({
  index,
  total,
  text,
  lastCaption,
  onCaption,
}: {
  index: number;
  total: number;
  text: string;
  lastCaption?: number;
  onCaption: (caption: number) => void;
}) {
  return (
    <div>
      {typeof lastCaption === "number" ? (
        <p className="mb-2 text-xs text-muted">Última legenda deste produto: {lastCaption + 1}</p>
      ) : null}
      <CaptionSwitch index={index} total={total} onCaption={onCaption} />
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function RoboScreen({
  order,
  released,
  panel,
  map,
  onProgram,
}: {
  order: string[];
  released: Record<string, boolean>;
  panel: RobotPanel;
  map: GradeMap;
  onProgram: (id: string) => void;
}) {
  const queue = order.filter((id) => released[id]);
  const done = queue.filter((id) => map[id]?.programmed).length;
  const currentId = queue.find((id) => !map[id]?.programmed) ?? null;
  const piece = currentId ? piecesSorted.find((item) => item.id === currentId) ?? null : null;
  const product = piece ? productById(piece.product) : null;
  const text = piece ? captionOf(piece, map).text : "";
  const showPanel = Boolean(panel.title.trim() || panel.highlight.trim() || panel.text.trim() || panel.link.trim());

  return (
    <main className="bg-ink text-fg">
      <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl uppercase tracking-wide">Robô</h1>
          <a className="chip" href="/">
            Painel
          </a>
        </div>
        {showPanel ? (
          <section className="mt-4 rounded-xl border border-line bg-surface p-3">
            {panel.title ? <p className="text-sm">{panel.title}</p> : null}
            {panel.highlight ? <p className="mt-1 text-sm text-flame">{panel.highlight}</p> : null}
            {panel.text ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{panel.text}</p> : null}
            {panel.link ? (
              <a className="mt-2 block break-all text-sm text-flame" href={panel.link}>
                {panel.link}
              </a>
            ) : null}
          </section>
        ) : null}
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-flame" style={{ width: queue.length ? `${(done / queue.length) * 100}%` : "0%" }} />
          </div>
          <p className="mt-2 text-xs text-muted">{queue.length ? `${done} de ${queue.length}` : "Nada liberado"}</p>
        </div>
        {!queue.length ? (
          <p className="mt-8 text-sm">Nada liberado no painel.</p>
        ) : !piece || !product ? (
          <p className="mt-8 font-display text-2xl uppercase tracking-wide">Finalizou</p>
        ) : (
          <article className="mt-4 rounded-xl bg-surface p-3">
            <img
              src={piece.image}
              alt={`${product.name}, ${piece.format === "story" ? "story" : "post"}`}
              width={piece.w}
              height={piece.h}
              className="block h-auto w-full bg-ink object-contain"
              style={{ aspectRatio: `${piece.w} / ${piece.h}` }}
            />
            <p className="mt-3 text-sm">{product.name}</p>
            <p className="mt-1 text-sm text-muted">{whenLabel(map[piece.id]?.at)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="chip" href={piece.image} download>
                Baixar
              </a>
              {piece.format === "story" ? (
                <>
                  <button type="button" className="chip" onClick={() => writeClipboard(STORY_LINK)}>
                    Copiar link
                  </button>
                  <button type="button" className="chip" onClick={() => writeClipboard(STORY_NAME)}>
                    Copiar nome
                  </button>
                </>
              ) : (
                <button type="button" className="chip" onClick={() => writeClipboard(text)}>
                  Copiar legenda
                </button>
              )}
            </div>
            {piece.format === "story" ? (
              <div className="mt-3">
                <p className="text-sm">Adesivo de personalização de link para story</p>
                <p className="mt-1 break-all text-sm text-muted">{STORY_LINK}</p>
                <p className="mt-1 text-sm">{STORY_NAME}</p>
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
            )}
            <button type="button" className="chip chip-flame mt-4" onClick={() => onProgram(piece.id)}>
              Programado
            </button>
          </article>
        )}
      </div>
    </main>
  );
}

function WhenFields({
  at,
  now,
  onAt,
}: {
  at: string | null;
  now: Date | null;
  onAt: (at: string) => void;
}) {
  const live = stamp(now ?? new Date());
  const value = at || live;
  const date = value.slice(0, 10);
  const time = value.slice(11, 16) || live.slice(11, 16);

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-muted">
        Data
        <input
          type="date"
          value={date}
          onChange={(event) => {
            const next = event.target.value || date;
            onAt(`${next}T${time}`);
          }}
          className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
        />
      </label>
      <label className="text-xs text-muted">
        Hora
        <input
          type="time"
          value={time}
          onChange={(event) => {
            const next = event.target.value || time;
            onAt(`${date}T${next}`);
          }}
          className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
        />
      </label>
    </div>
  );
}

function PieceDetail({
  piece,
  map,
  now,
  onAt,
  onProgram,
  onUndo,
  onCaption,
  onClose,
}: {
  piece: Piece;
  map: GradeMap;
  now: Date | null;
  onAt: (at: string) => void;
  onProgram: () => void;
  onUndo: () => void;
  onCaption: (caption: number) => void;
  onClose: () => void;
}) {
  const at = map[piece.id]?.at ?? null;
  const { product, index, text, total } = captionOf(piece, map);
  const { copied, copy } = useCopy();
  const isStory = piece.format === "story";

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-ink px-4 py-3">
        <div>
          <p className="font-display uppercase tracking-wide">{product.name}</p>
          <p className="text-xs uppercase tracking-wide text-muted">{isStory ? "Story" : "Post"}</p>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="icon"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <Shot src={piece.image} alt={product.name} />
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-12">
        <DownloadLink href={piece.image} />
        {isStory ? (
          <StoryBlock />
        ) : (
          <>
            <CaptionPanel index={index} total={total} text={text} onCaption={onCaption} />
            <CopyButton
              label="Copiar legenda"
              done={copied === "caption"}
              onClick={() => copy("caption", text)}
            />
          </>
        )}
        <WhenFields at={at} now={now} onAt={onAt} />
        <ProgramControl slot={map[piece.id]} now={now} onProgram={onProgram} onUndo={onUndo} />
      </div>
    </div>
  );
}
