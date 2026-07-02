/**
 * Auth layout — centered card for sign-in/sign-up pages.
 * Nested inside the root layout, which provides Header + Footer.
 */

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
