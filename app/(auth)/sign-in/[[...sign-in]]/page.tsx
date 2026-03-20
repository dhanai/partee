import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="partee-shell flex justify-center">
      <SignIn />
    </main>
  );
}
