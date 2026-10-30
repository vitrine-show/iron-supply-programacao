import { createFileRoute } from "@tanstack/react-router";
import { GradeApp } from "@/components/grade-app";

type Search = { card?: string; robo?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const next: Search = {};
    if (typeof search.card === "string" && search.card) next.card = search.card;
    if (search.robo === "1" || search.proto === "robo") next.robo = "1";
    return next;
  },
  component: Home,
});

function Home() {
  const { card, robo } = Route.useSearch();
  return <GradeApp cardId={card || null} robo={robo === "1"} />;
}