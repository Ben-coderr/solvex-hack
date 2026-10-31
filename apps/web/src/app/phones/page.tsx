import { redirect } from 'next/navigation';
import { Phones } from '@/components/demo/phones';
import { DispatchProviders } from '@/components/dispatch/providers';
import { healthBody } from '@/server/health';
import { getActorFromCookies } from '@/server/auth';

// D11. DEMO_MODE only (the proxy answers 404 otherwise); dispatcher or admin, like the demo API.
export default async function PhonesPage() {
  const actor = await getActorFromCookies();
  if (!actor) redirect('/login?next=/phones');
  if (actor.role === 'hospital') redirect(actor.hospitalId ? `/hospital/${actor.hospitalId}` : '/login');
  return (
    <DispatchProviders health={healthBody()}>
      <Phones />
    </DispatchProviders>
  );
}
