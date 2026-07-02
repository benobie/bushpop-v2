import Link from "next/link";
import { Button } from "@bushpop/ui";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="font-display text-4xl font-bold text-brand-800">404</h1>
      <p className="text-brand-500">This page doesn't exist.</p>
      <Button asChild variant="primary">
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
