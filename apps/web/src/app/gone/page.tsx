// Pure RSC — no "use client". Zero JS.
export const metadata = {
  title: "Page Removed — Bushpop",
  description: "This page has been permanently removed from Bushpop.",
};

export default function GonePage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Page Removed</h1>
      <p className="text-lg text-gray-600 mb-4">
        This page has been permanently removed from Bushpop.
      </p>
      <p className="text-gray-500">
        <a href="/" className="text-blue-600 underline">
          Return to Bushpop home
        </a>
      </p>
    </main>
  );
}
