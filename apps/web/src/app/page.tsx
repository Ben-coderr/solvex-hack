import { smokePacket } from "@/lib/smoke-packet";

// P0 foundations smoke page: proves @najda/shared and @najda/tokens resolve in the web app.
// Replaced by the dispatcher dashboard in P3.
export default function Home() {
  const { wire, length, max, roundTrip, matchesGolden } = smokePacket();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <p className="w-fit rounded-pill border border-line px-3 py-1 font-mono text-sm text-muted-foreground">
        DEMO · P0 smoke check · synthetic data
      </p>
      <h1 className="font-display text-4xl font-semibold">NAJDA</h1>
      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-muted-foreground">DZ-MSD packet (encoded by @najda/shared)</h2>
        <code data-testid="packet" dir="ltr" className="wrap-break-word font-mono text-lg leading-relaxed">
          {wire}
        </code>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Length</dt>
          <dd className="font-mono">{length ?? "not GSM-7"} / {max}</dd>
          <dt className="text-muted-foreground">Decodes back</dt>
          <dd className="font-mono">{roundTrip ? "yes" : "no"}</dd>
          <dt className="text-muted-foreground">Matches golden vector</dt>
          <dd className="font-mono">{matchesGolden ? "yes" : "no"}</dd>
        </dl>
      </section>
    </main>
  );
}
