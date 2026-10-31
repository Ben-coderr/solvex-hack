import { notFound, redirect } from 'next/navigation';
import { DispatchProviders } from '@/components/dispatch/providers';
import { healthBody } from '@/server/health';
import { HospitalView } from '@/components/hospital/hospital-view';
import { getActorFromCookies } from '@/server/auth';

// D8: a hospital account sees only its own facility; dispatchers may open any (to check what the ED sees).
export default async function HospitalPage({ params }: PageProps<'/hospital/[id]'>) {
  const { id } = await params;
  const actor = await getActorFromCookies();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/hospital/${id}`)}`);
  if (!/^[A-Z0-9-]{1,32}$/.test(id)) notFound();
  if (actor.role === 'hospital' && actor.hospitalId !== id) {
    redirect(actor.hospitalId ? `/hospital/${actor.hospitalId}` : '/login');
  }
  return (
    <DispatchProviders health={healthBody()}>
      <HospitalView hospitalId={id} canNavigate={actor.role !== 'hospital'} />
    </DispatchProviders>
  );
}
