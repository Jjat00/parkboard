import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { preferredLang } from "@/lib/lang";

const NOTE = {
  en: ["By signing up you accept the", "privacy policy", ". What you park is stored encrypted."],
  es: ["Al registrarte aceptas la", "política de privacidad", ". Lo que parqueas se guarda cifrado."],
};

export default async function SignUpPage() {
  const note = NOTE[await preferredLang()];
  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 bg-ink">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="text-gradient">Parkboard</span>
      </h1>
      <SignUp />
      <p className="max-w-sm px-4 text-center text-xs text-faint">
        {note[0]}{" "}
        <Link href="/privacy" className="text-muted underline underline-offset-4 hover:text-fg">
          {note[1]}
        </Link>
        {note[2]}
      </p>
    </main>
  );
}
