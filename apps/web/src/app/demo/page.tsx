import { redirect } from 'next/navigation';
import { DemoConsole } from '@/components/demo/demo-console';
import { DispatchProviders } from '@/components/dispatch/providers';
import { healthBody } from '@/server/health';
import { getActorFromCookies } from '@/server/auth';

// D11. DEMO_MODE only (the proxy answers 404 otherwise); dispatcher or admin, like the demo API.
export default async function DemoPage() {
  const actor = await getActorFromCookies();
  if (!actor) redirect('/login?next=/demo');
  if (actor.role === 'hospital') redirect(actor.hospitalId ? `/hospital/${actor.hospitalId}` : '/login');
  return (
    <DispatchProviders health={healthBody()}>
      <DemoConsole />
    </DispatchProviders>
  );
}
