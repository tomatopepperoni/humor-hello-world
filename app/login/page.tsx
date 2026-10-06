import Link from "next/link";
import GoogleSignInButton from "./GoogleSignInButton";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const hadError = params.error === "auth";

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center p-8">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="mt-2 text-gray-600">
        Sign in to post photos, get AI captions and vote. Browsing is open to everyone.
      </p>

      {hadError && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Something went wrong during sign-in. Please try again.
        </p>
      )}

      <div className="mt-8">
        <GoogleSignInButton next={next} />
      </div>

      <Link href="/" className="mt-8 text-sm text-gray-500 underline">
        ← Back home
      </Link>
    </main>
  );
}
