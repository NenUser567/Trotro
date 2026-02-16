import Driver from "./Driver.jsx";

export default function App() {
  return (
    <div className="min-h-screen text-zinc-100">
      <div className="fixed inset-0 -z-10 bg-zinc-950" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,rgba(245,158,11,0.12),transparent_60%),radial-gradient(900px_500px_at_90%_10%,rgba(99,102,241,0.10),transparent_55%)]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/75 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 border border-amber-400/20">
                <span className="text-lg">🚌</span>
              </div>
              <div className="leading-tight">
                <div className="text-base font-black tracking-tight">Trotro</div>
                <div className="text-xs text-zinc-500 -mt-0.5">Driver</div>
              </div>
            </div>
            <div className="text-xs text-zinc-400">Driver App</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">
        <Driver />
      </main>
    </div>
  );
}
