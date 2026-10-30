import { Dashboard } from '@/components/dispatch/dashboard';
import { DispatchGate } from '@/components/dispatch/dispatch-gate';

export default function DispatchHome() {
  return (
    <DispatchGate next="/">
      <Dashboard />
    </DispatchGate>
  );
}
