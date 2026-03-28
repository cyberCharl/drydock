export default function Page() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_40%),linear-gradient(180deg,_#07111f_0%,_#030712_55%,_#02040a_100%)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-sky-300/80">
              Gyre Workbench
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Drydock
            </h1>
          </div>
          <p className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            Frontend online
          </p>
        </header>

        <section className="flex flex-1 items-center">
          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  Board view, list view, detail panel, and real-time status are
                  wired in next.
                </p>
                <p className="max-w-2xl text-sm leading-7 text-slate-400">
                  This shell is the Phase 2 foundation. The app defaults to dark
                  mode, proxies REST requests through <code>/api</code>, and is
                  ready for the workbench UI.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-sky-950/30 backdrop-blur">
              <p className="text-sm font-medium text-sky-200">Proxy check</p>
              <p className="mt-3 font-mono text-xs leading-6 text-slate-300">
                GET /api/health
                <br />
                -&gt; http://api:3000/health
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
