// Pure RSC — no "use client". Zero JS.
export const metadata = {
  title: "Page Removed — Bushpop",
  description: "This page has been permanently removed from Bushpop.",
};

export default function GonePage() {
  return (
    <main className="shell max-w-3xl py-20">
      <h1 className="page mb-4">Page removed</h1>
      <p className="muted mb-4 text-lg">
        This page has been permanently removed from Bushpop.
      </p>
      <p>
        <a href="/" className="font-medium text-green-ink underline">
          Return to Bushpop home
        </a>
      </p>
    </main>
  );
}
