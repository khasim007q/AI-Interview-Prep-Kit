export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-indigo-600">
          AI Interview Prep Kit
        </h1>
        <p className="text-lg text-slate-600">
          Deterministic interview preparation platform with automated company research, structured question generation, and personalized study scheduling.
        </p>
        <div className="pt-4 flex justify-center gap-4">
          <a
            href="/login"
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition"
          >
            Get Started
          </a>
        </div>
      </div>
    </main>
  );
}
