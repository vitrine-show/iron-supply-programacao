import { useEffect, useState } from "react";
import { piecesSorted, productById, type Piece } from "@/data/catalog";
import { loadGrade, type GradeMap } from "@/lib/grade";
import { pullProgramacao } from "@/lib/programacao";

const KEY = "iron-proto-v1";
const STORY_LINK = "https://wa.me/5531988551275";
const STORY_NAME = "FAÇA SEU PEDIDO PELO WHATSAPP";

type Panel = { title: string; highlight: string; text: string; link: string };

type Proto = {
  order: string[];
  released: string[];
  done: string[];
  panel: Panel;
};

const emptyPanel: Panel = { title: "", highlight: "", text: "", link: "" };

function initial(): Proto {
  const order = piecesSorted.map((piece) => piece.id);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { order, released: [], done: [], panel: emptyPanel };
    const parsed = JSON.parse(raw) as Partial<Proto>;
    const known = new Set(order);
    const saved = (parsed.order ?? []).filter((id) => known.has(id));
    const missing = order.filter((id) => !saved.includes(id));
    return {
      order: [...saved, ...missing],
      released: (parsed.released ?? []).filter((id) => known.has(id)),
      done: (parsed.done ?? []).filter((id) => known.has(id)),
      panel: { ...emptyPanel, ...parsed.panel },
    };
  } catch {
    return { order, released: [], done: [], panel: emptyPanel };
  }
}

function panelOn(panel: Panel) {
  return Boolean(panel.title.trim() || panel.highlight.trim() || panel.text.trim() || panel.link.trim());
}

function whenLabel(at: string | null | undefined) {
  if (!at || at.length < 16) return "Sem data";
  return `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)} · ${at.slice(11, 16)}`;
}

function captionText(piece: Piece, map: GradeMap) {
  const product = productById(piece.product);
  const total = product.captions.length;
  const index = map[piece.id]?.caption ?? 0;
  const safe = total ? ((index % total) + total) % total : 0;
  return product.captions[safe] ?? "";
}

async function copyText(text: string) {
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

function useProto() {
  const [proto, setProto] = useState<Proto>(initial);
  const [map, setMap] = useState<GradeMap>({});

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(proto));
  }, [proto]);

  useEffect(() => {
    const local = loadGrade();
    setMap(local);
    let cancel = false;
    pullProgramacao()
      .then((remote) => {
        if (!cancel) setMap({ ...local, ...remote });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  function move(index: number, to: number) {
    if (to < 0 || to >= proto.order.length || to === index) return;
    setProto((current) => {
      const order = current.order.slice();
      const [id] = order.splice(index, 1);
      order.splice(to, 0, id);
      return { ...current, order };
    });
  }

  return { proto, setProto, map, move };
}

export function ProtoPainel() {
  const { proto, setProto, map, move } = useProto();
  const byId = new Map(piecesSorted.map((piece) => [piece.id, piece]));

  return (
    <main className="bg-ink text-fg">
      <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl uppercase tracking-wide">Seu painel</h1>
          <a className="chip" href="/?proto=robo">
            Ver o robô
          </a>
        </div>
        <p className="mt-2 text-sm text-muted">
          Protótipo. Ainda não grava no Supabase. O robô só vê o que você liberar, nesta ordem.
        </p>

        <section className="mt-5 rounded-xl bg-surface p-3">
          <h2 className="text-sm">Painel fixo do robô</h2>
          <p className="mt-1 text-xs text-muted">Se ficar vazio, não aparece para ele.</p>
          <label className="mt-3 block text-xs text-muted">
            Título
            <input
              value={proto.panel.title}
              onChange={(event) =>
                setProto((current) => ({ ...current, panel: { ...current.panel, title: event.target.value } }))
              }
              className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            Destaque
            <input
              value={proto.panel.highlight}
              onChange={(event) =>
                setProto((current) => ({
                  ...current,
                  panel: { ...current.panel, highlight: event.target.value },
                }))
              }
              className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            Texto
            <textarea
              value={proto.panel.text}
              rows={4}
              onChange={(event) =>
                setProto((current) => ({ ...current, panel: { ...current.panel, text: event.target.value } }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-ink px-2 py-2 text-base text-fg"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            Link
            <input
              value={proto.panel.link}
              onChange={(event) =>
                setProto((current) => ({ ...current, panel: { ...current.panel, link: event.target.value } }))
              }
              className="mt-1 h-10 w-full rounded-lg border border-line bg-ink px-2 text-base text-fg"
            />
          </label>
        </section>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h2 className="text-sm">Fila</h2>
          <button
            type="button"
            className="chip"
            onClick={() => setProto((current) => ({ ...current, done: [] }))}
          >
            Zerar teste
          </button>
        </div>

        <ul className="mt-3 flex flex-col gap-3">
          {proto.order.map((id, index) => {
            const piece = byId.get(id);
            if (!piece) return null;
            const product = productById(piece.product);
            const on = proto.released.includes(id);
            return (
              <li key={id} className="rounded-xl bg-surface p-3">
                <div className="flex gap-3">
                  <img
                    src={piece.image}
                    alt=""
                    width={piece.w}
                    height={piece.h}
                    className="h-20 w-16 rounded-lg bg-ink object-contain"
                    draggable={false}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{product.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                      {piece.format === "story" ? "Story" : "Post"}
                    </p>
                    <p className="mt-1 text-xs text-muted">{whenLabel(map[id]?.at)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="chip" onClick={() => move(index, index - 1)} disabled={index === 0}>
                    Subir
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => move(index, index + 1)}
                    disabled={index === proto.order.length - 1}
                  >
                    Descer
                  </button>
                  <button
                    type="button"
                    className={on ? "chip chip-flame" : "chip"}
                    onClick={() =>
                      setProto((current) => ({
                        ...current,
                        released: on
                          ? current.released.filter((item) => item !== id)
                          : [...current.released, id],
                      }))
                    }
                  >
                    {on ? "Liberado" : "Liberar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

export function ProtoRobo() {
  const { proto, setProto, map } = useProto();
  const byId = new Map(piecesSorted.map((piece) => [piece.id, piece]));
  const queue = proto.order.filter((id) => proto.released.includes(id));
  const finished = queue.filter((id) => proto.done.includes(id)).length;
  const currentId = queue.find((id) => !proto.done.includes(id)) ?? null;
  const piece = currentId ? byId.get(currentId) ?? null : null;
  const product = piece ? productById(piece.product) : null;
  const showPanel = panelOn(proto.panel);

  return (
    <main className="bg-ink text-fg">
      <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl uppercase tracking-wide">Robô</h1>
          <a className="chip" href="/?proto=painel">
            Painel
          </a>
        </div>

        {showPanel ? (
          <section className="mt-4 rounded-xl border border-line bg-surface p-3">
            {proto.panel.title ? <p className="text-sm">{proto.panel.title}</p> : null}
            {proto.panel.highlight ? <p className="mt-1 text-sm text-flame">{proto.panel.highlight}</p> : null}
            {proto.panel.text ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{proto.panel.text}</p>
            ) : null}
            {proto.panel.link ? (
              <a className="mt-2 block break-all text-sm text-flame" href={proto.panel.link}>
                {proto.panel.link}
              </a>
            ) : null}
          </section>
        ) : null}

        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full bg-flame"
              style={{ width: queue.length ? `${(finished / queue.length) * 100}%` : "0%" }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {queue.length ? `${finished} de ${queue.length}` : "Nada liberado"}
          </p>
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
                  <button type="button" className="chip" onClick={() => copyText(STORY_LINK)}>
                    Copiar link
                  </button>
                  <button type="button" className="chip" onClick={() => copyText(STORY_NAME)}>
                    Copiar nome
                  </button>
                </>
              ) : (
                <button type="button" className="chip" onClick={() => copyText(captionText(piece, map))}>
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
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{captionText(piece, map)}</p>
            )}
            <button
              type="button"
              className="chip chip-flame mt-4"
              onClick={() => setProto((current) => ({ ...current, done: [...current.done, piece.id] }))}
            >
              Programado
            </button>
          </article>
        )}
      </div>
    </main>
  );
}
