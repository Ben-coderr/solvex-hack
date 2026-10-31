import { cn } from '@/lib/utils';

export interface HospitalMarkerProps {
  level: 'A' | 'B' | 'C';
  /** the facility the route goes to */
  chosen?: boolean;
  className?: string;
}

/**
 * A facility on the map: rounded plaque with an "H". Never a cross (docs/12 §2.3: no emblem imitation) and never a
 * triage colour, so it cannot be read as a band. Level A is larger. Decorative: the button around it carries the label.
 */
export function HospitalMarker({ level, chosen, className }: HospitalMarkerProps) {
  const px = level === 'A' ? 22 : 18;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid place-items-center rounded-[6px] border-2 border-bg bg-brand-fill font-bold leading-none text-on-brand shadow',
        chosen && 'outline-3 outline-offset-1 outline-brand-text',
        className,
      )}
      style={{ width: px, height: px, fontSize: level === 'A' ? 13 : 11 }}
    >
      H
    </span>
  );
}
