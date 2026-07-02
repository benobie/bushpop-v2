import Link from "next/link";
import { Button, Input } from "@bushpop/ui";

interface HeaderProps {
  channelName: string;
}

export function Header({ channelName }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-brand-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="font-display text-xl font-bold text-brand-800"
        >
          {channelName}
        </Link>

        {/* Native GET form — no JS needed for basic search */}
        <form action="/search" method="get" className="mx-4 hidden max-w-md flex-1 md:block">
          <Input
            name="q"
            placeholder="Search listings…"
            className="w-full"
            autoComplete="off"
          />
        </form>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/bag">Bag</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link href="/sign-up">Sign up</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
