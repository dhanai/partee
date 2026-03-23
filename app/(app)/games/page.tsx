import { Suspense } from "react";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { GamesScreenWeb } from "./games-screen-web";

export default function GamesPage() {
  return (
    <Suspense fallback={<ParfadeLoadingBlock className="py-8" size="sm" />}>
      <GamesScreenWeb />
    </Suspense>
  );
}
