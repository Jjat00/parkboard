import { SignIn } from "@clerk/nextjs";
import { LangSwitch } from "@/components/lang";

export default function Page() {
  return (
    <main className="relative flex h-full flex-col items-center justify-center gap-8 bg-ink">
      <LangSwitch className="absolute right-4 top-4" />
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-gradient">Parkboard</span>
      </h1>
      <SignIn />
    </main>
  );
}
