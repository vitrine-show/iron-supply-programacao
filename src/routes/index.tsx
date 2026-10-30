import { createFileRoute } from "@tanstack/react-router";
import { GradeApp } from "@/components/grade-app";

type Search = { card: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    card: typeof search.card === "string" ? search.card : "",
  }),
  component: Home,
});

function Home() {
  const { card } = Route.useSearch();
  return <GradeApp cardId={card || null} />;
}
