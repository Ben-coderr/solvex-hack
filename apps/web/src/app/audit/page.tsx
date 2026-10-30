import { AuditView } from '@/components/dispatch/audit-view';
import { DispatchGate } from '@/components/dispatch/dispatch-gate';

export default function AuditPage() {
  return (
    <DispatchGate next="/audit">
      <AuditView />
    </DispatchGate>
  );
}
