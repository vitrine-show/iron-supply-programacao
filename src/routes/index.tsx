import { createFileRoute } from "@tanstack/react-router";
import { GradeApp } from "@/components/grade-app";
import { ProtoPainel, ProtoRobo } from "@/components/proto";

type Search = { card?: string; proto?: "painel" | "robo" };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const next: Search = {};
    if (typeof search.card === "string" && search.card) next.card = search.card;
    if (search.proto === "painel" || search.proto === "robo") next.proto = search.proto;
    return next;
  },
  component: Home,
});

function Home() {
  const { card, proto } = Route.useSearch();
  if (proto === "painel") return <ProtoPainel />;
  if (proto === "robo") return <ProtoRobo />;
  return <GradeApp cardId={card || null} />;
}