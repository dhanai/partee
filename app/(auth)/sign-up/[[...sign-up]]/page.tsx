import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-fairway px-6">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-fairway-300">
          Partee
        </p>
        <SignUp />
      </div>
    </main>
  );
}
