import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 bg-ink">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-gradient">Parkboard</span>
      </h1>
      <SignIn />
    </main>
  );
}
