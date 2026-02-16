import Passenger from "./Passenger.jsx";
import { IOSAddToHomeScreenBanner } from "@trotro/shared";

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
                <div className="text-xs text-zinc-500 -mt-0.5">Passenger</div>
              </div>
            </div>
            <div className="text-xs text-zinc-400">Passenger App</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Passenger />
          </div>

          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/45 backdrop-blur p-6">
              <div className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-400 uppercase">
                iPhone install
              </div>
              <div className="mt-2 text-sm text-zinc-300">
                Open in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>.
              </div>
            </div>
          </aside>
        </div>
      </main>

      <IOSAddToHomeScreenBanner />
    </div>
  );
}
