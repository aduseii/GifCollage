import { createFileRoute } from "@tanstack/react-router";
import { SpliceApp } from "@/components/splice-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SpliceApp />;
}
