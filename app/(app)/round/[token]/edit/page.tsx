"use client";

import { RoundEditScreenWeb } from "@/components/round-edit-screen-web";

export default function RoundEditPage({ params }: { params: { token: string } }) {
  return <RoundEditScreenWeb inviteToken={params.token} />;
}
