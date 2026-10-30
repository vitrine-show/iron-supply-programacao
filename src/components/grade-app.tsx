import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  defaultCaptionIndex,
  piecesSorted,
  productById,
  type Piece,
} from "@/data/catalog";
import { dayKey, loadGrade, phase, saveGrade, stamp, type GradeMap, type Slot } from "@/lib/grade";
import { pullProgramacao, pushProgramacao } from "@/lib/programacao";

const STORY_LINK = "https://wa.me/5531988551275";
const STORY_NAME = "FAÇA SEU PEDIDO PELO WHATSAPP";

type CalendarView = "semana" | "dia";

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

export function GradeApp() {
  const [map, setMap] = useState<GradeMap>({});
  const [today, setToday] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);
  const [layout, setLayout] = useState<"lista" | "grade">("lista");
  const [view, setView] = useState<CalendarView>("semana");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const closeDetail = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 15000);
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
        if (slot?.at) {
          next[piece.id] = {
            at: slot.at,
            caption: slot.caption ?? defaultCaptionIndex(piece),
            programmed: Boolean(slot.programmed),
          };
          continue;
        }
        next[piece.id] = {
          at: stamp(now),
          caption: slot?.caption ?? defaultCaptionIndex(piece),
          programmed: false,
        };
      }
      setMap(next);
      setToday(now);
      setCursor(now);
      setSynced(true);
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

  function patch(id: string, next: Partial<{ at: string | null; caption: number; programmed: boolean }>) {
    setMap((current) => {
      const piece = piecesSorted.find((item) => item.id === id);
      const prev = current[id] ?? {
        at: null,
        caption: piece ? defaultCaptionIndex(piece) : 0,
        programmed: false,
      };
      return { ...current, [id]: { ...prev, ...next } };
    });
  }

  function setWhen(id: string, at: string) {
    patch(id, { at, programmed: false });
  }

  const openPiece = piecesSorted.find((piece) => piece.id === openId) ?? null;

  return (
    <main className="min-h-dvh bg-ink text-fg">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-12">
        <header>
          <img src="/marca.png" alt="Iron Supply" className="mx-auto h-14 w-auto" />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-xl uppercase leading-none tracking-wide">Programação</h1>
              <p className="mt-1 text-sm text-muted">Posts e stories</p>
            </div>
            <button type="button" onClick={() => setCalendarOpen(true)} className="btn btn-flame shrink-0">
              Calendário
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setLayout("lista")}
              className={layout === "lista" ? "btn btn-flame flex-1" : "btn btn-soft flex-1"}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setLayout("grade")}
              className={layout === "grade" ? "btn btn-flame flex-1" : "btn btn-soft flex-1"}
            >
              Grade
            </button>
          </div>
        </header>

        <div className="mt-6 flex flex-col gap-8">
          {(["story", "post"] as const).map((format) => {
            const items = piecesSorted.filter((piece) => piece.format === format);
            if (items.length === 0) return null;
            return (
              <section key={format} aria-label={format === "story" ? "Stories" : "Posts"}>
                <h2 className="font-display text-lg uppercase tracking-wide">
                  {format === "story" ? "Stories" : "Posts"}
                </h2>
                <ul
                  className={
                    layout === "grade"
                      ? "mt-3 grid grid-cols-2 gap-3 md:grid-cols-3"
                      : "mt-3 flex flex-col gap-4"
                  }
                >
                  {items.map((piece) => (
                    <li key={piece.id}>
                      {layout === "grade" ? (
                        <GradeTile
                          piece={piece}
                          map={map}
                          now={today}
                          onOpen={() => setOpenId(piece.id)}
                        />
                      ) : (
                        <PieceCard
                          piece={piece}
                          map={map}
                          onAt={(at) => setWhen(piece.id, at)}
                          onProgram={() => patch(piece.id, { programmed: true })}
                          onUndo={() => patch(piece.id, { programmed: false })}
                          now={today}
                          onCaption={(caption) => patch(piece.id, { caption })}
                          onOpen={() => setOpenId(piece.id)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
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
          onCaption={(caption) => patch(openPiece.id, { caption })}
          onClose={closeDetail}
        />
      )}
    </main>
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
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="btn btn-icon"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="mx-auto mt-3 flex max-w-3xl gap-2">
          {(["semana", "dia"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onView(item)}
              className={
                view === item ? "btn btn-flame flex-1" : "btn btn-soft flex-1"
              }
            >
              {item === "semana" ? "Semana" : "Dia"}
            </button>
          ))}
        </div>
        <div className="mx-auto mt-3 flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            aria-label={view === "semana" ? "Semana anterior" : "Dia anterior"}
            onClick={() => onCursor(addDays(cursor, -step))}
            className="btn btn-icon"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <p className="text-center font-display text-lg uppercase tracking-wide">{title}</p>
          <button
            type="button"
            aria-label={view === "semana" ? "Próxima semana" : "Próximo dia"}
            onClick={() => onCursor(addDays(cursor, step))}
            className="btn btn-icon"
          >
            <ChevronRight aria-hidden="true" />
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
                            src={piece.image}
                            alt={`${product.name}, ${piece.format === "story" ? "story" : "post"}`}
                            className={
                              view === "dia"
                                ? "max-h-[70vh] w-auto max-w-full object-contain"
                                : "max-h-64 w-auto max-w-full object-contain"
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
      <img src={src} alt={alt} className="max-h-[70vh] w-auto max-w-full object-contain" />
    </div>
  );
}

function DownloadLink({ href }: { href: string }) {
  const id = href.split("/d/")[1]?.split(/[?#]/)[0];
  const file = id ? `https://drive.google.com/uc?export=download&id=${id}` : href;
  return (
    <a href={file} className="btn btn-soft">
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
      className="btn btn-flame self-start"
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
        className="btn btn-icon"
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
        className="btn btn-icon"
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
      <button type="button" onClick={onProgram} className="btn btn-flame w-full">
        Programado
      </button>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <p className={state === "postado" ? "btn btn-posted" : "btn btn-soft"}>
        {state === "postado" ? "Postado" : "Programado"}
      </p>
      <button type="button" onClick={onUndo} className="btn btn-flame">
        Voltar
      </button>
    </div>
  );
}

function GradeTile({
  piece,
  map,
  now,
  onOpen,
}: {
  piece: Piece;
  map: GradeMap;
  now: Date | null;
  onOpen: () => void;
}) {
  const product = productById(piece.product);
  const state = phase(map[piece.id], now ?? new Date());
  const isStory = piece.format === "story";
  return (
    <button type="button" onClick={onOpen} className="w-full overflow-hidden rounded-xl bg-surface text-left">
      <span className="flex h-40 items-center justify-center bg-ink p-2">
        <img
          src={piece.image}
          alt={`${product.name}, ${isStory ? "story" : "post"}`}
          className="max-h-full max-w-full object-contain"
        />
      </span>
      <span className="block p-2">
        <span className="block text-xs font-medium">{product.name}</span>
        <span className="mt-1 block text-xs uppercase tracking-wide text-muted">
          {isStory ? "Story" : "Post"}
        </span>
        {state !== "aberto" && (
          <span className={state === "postado" ? "btn btn-posted mt-2 h-8 w-full text-xs" : "btn btn-soft mt-2 h-8 w-full text-xs"}>
            {state === "postado" ? "Postado" : "Programado"}
          </span>
        )}
      </span>
    </button>
  );
}

function PieceCard({
  piece,
  map,
  now,
  onAt,
  onProgram,
  onUndo,
  onCaption,
  onOpen,
}: {
  piece: Piece;
  map: GradeMap;
  now: Date | null;
  onAt: (at: string) => void;
  onProgram: () => void;
  onUndo: () => void;
  onCaption: (caption: number) => void;
  onOpen: () => void;
}) {
  const at = map[piece.id]?.at ?? null;
  const { product, index, text, total } = captionOf(piece, map);
  const { copied, copy } = useCopy();
  const isStory = piece.format === "story";

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface">
      <button type="button" onClick={onOpen} className="block w-full">
        <Shot src={piece.image} alt={`${product.name}, ${isStory ? "story" : "post"}`} />
      </button>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-medium">{product.name}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">{isStory ? "Story" : "Post"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadLink href={piece.image} />
          <button type="button" onClick={onOpen} className="btn btn-soft">
            Ver maior
          </button>
        </div>
        {isStory ? (
          <StoryBlock />
        ) : (
          <>
            <CaptionSwitch index={index} total={total} onCaption={onCaption} />
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
            <CopyButton
              label="Copiar legenda"
              done={copied === "caption"}
              onClick={() => copy("caption", text)}
            />
          </>
        )}
        <WhenFields at={at} onAt={onAt} />
        <ProgramControl slot={map[piece.id]} now={now} onProgram={onProgram} onUndo={onUndo} />
      </div>
    </article>
  );
}

function WhenFields({ at, onAt }: { at: string | null; onAt: (at: string) => void }) {
  const now = stamp(new Date());
  const value = at || now;
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const place = useRef(0);

  function remember() {
    place.current = window.scrollY;
  }

  function restore() {
    const y = place.current;
    const back = () => {
      if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
    };
    window.setTimeout(back, 0);
    window.setTimeout(back, 80);
    window.setTimeout(back, 280);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-muted">
        Data
        <input
          type="date"
          value={date}
          onPointerDown={() => {
            remember();
            restore();
          }}
          onChange={(event) => {
            const next = event.target.value || date;
            onAt(`${next}T${time}`);
            restore();
          }}
          className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
        />
      </label>
      <label className="text-xs text-muted">
        Hora
        <input
          type="time"
          value={time}
          onPointerDown={() => {
            remember();
            restore();
          }}
          onChange={(event) => {
            const next = event.target.value || time;
            onAt(`${date}T${next}`);
            restore();
          }}
          className="mt-1 h-11 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
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
          className="btn btn-icon"
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
            <CaptionSwitch index={index} total={total} onCaption={onCaption} />
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
            <CopyButton
              label="Copiar legenda"
              done={copied === "caption"}
              onClick={() => copy("caption", text)}
            />
          </>
        )}
        <WhenFields at={at} onAt={onAt} />
        <ProgramControl slot={map[piece.id]} now={now} onProgram={onProgram} onUndo={onUndo} />
      </div>
    </div>
  );
}
