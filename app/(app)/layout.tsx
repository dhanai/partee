import { AppShell } from "./app-shell";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
