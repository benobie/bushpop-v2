// Pure RSC — no "use client". Content pages stay zero-JS for CWV.
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Bushpop</h1>
      <p className="text-lg text-gray-600 mb-8">
        Australia&apos;s secondhand fashion marketplace.
      </p>
      <nav>
        <ul className="space-y-2">
          <li>
            <Link href="/guides/size-charts/" className="text-blue-600 underline">
              Size Charts
            </Link>
          </li>
          <li>
            <Link href="/shop/" className="text-blue-600 underline">
              Shop
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
