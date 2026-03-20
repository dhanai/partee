import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="partee-shell flex justify-center">
      <SignUp />
    </main>
  );
}
