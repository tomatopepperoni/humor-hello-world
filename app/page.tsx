import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Hello World</h1>
      <Link href="/jokes" className="mt-4 inline-block underline">
        View jokes →
      </Link>
    </main>
  );
}
