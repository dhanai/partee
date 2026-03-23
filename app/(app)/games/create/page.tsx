import { Suspense } from "react";
import { ParfadeLoadingBlock } from "@/components/parfade-spinner";
import { GamesCreateWeb } from "./games-create-web";

export default function GamesCreatePage() {
  return (
    <Suspense fallback={<ParfadeLoadingBlock className="py-8" size="sm" />}>
      <GamesCreateWeb />
    </Suspense>
  );
}
