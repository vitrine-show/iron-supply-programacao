import { createFileRoute } from "@tanstack/react-router";
import { GradeApp } from "@/components/grade-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GradeApp />;
}
