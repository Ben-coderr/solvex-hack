import type { IncidentStatus } from '../services/ingest-store';

/**
 * Incident lifecycle (docs/03 D4). Every transition is a human click; nothing advances automatically.
 * CANCELLED = false alarm (reason required). MERGED is set only by a manual merge, never by PATCH.
 */
export const TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  RECEIVED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ON_SCENE', 'CANCELLED'],
  ON_SCENE: ['TRANSPORTING', 'CLOSED'],
  TRANSPORTING: ['AT_HOSPITAL'],
  AT_HOSPITAL: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
  MERGED: [],
};

export const STATUSES = Object.keys(TRANSITIONS) as IncidentStatus[];

/** Transitions that change the picture for everyone and therefore need a written reason. */
export const REASON_REQUIRED: ReadonlySet<IncidentStatus> = new Set(['CANCELLED']);

export const MIN_REASON_LENGTH = 5;

export type TransitionCheck = { ok: true } | { ok: false; why: string };

/** Why a transition is (not) allowed — the same text feeds the disabled-button tooltip in the dashboard. */
export function checkTransition(from: IncidentStatus, to: IncidentStatus, reason?: string | null): TransitionCheck {
  if (from === to) return { ok: false, why: `already ${from}` };
  if (!TRANSITIONS[from].includes(to)) {
    const allowed = TRANSITIONS[from];
    return { ok: false, why: allowed.length ? `${from} can only move to ${allowed.join(' or ')}` : `${from} is final` };
  }
  if (REASON_REQUIRED.has(to) && (reason?.trim().length ?? 0) < MIN_REASON_LENGTH) {
    return { ok: false, why: `${to} needs a reason (at least ${MIN_REASON_LENGTH} characters)` };
  }
  return { ok: true };
}

export const hasReason = (reason?: string | null): reason is string => (reason?.trim().length ?? 0) >= MIN_REASON_LENGTH;
