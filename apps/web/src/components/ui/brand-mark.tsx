import { cn } from '@/lib/utils';
import { BRAND } from '@/brand';

/**
 * The Sellekni mark, single-colour inside the product (docs/06 §11): a white mask (scripts/make-brand.py) filled
 * with the `logoMono` token, so it follows light/dark. The red logo is for the favicon / app icon only.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden
      className={cn('inline-block shrink-0 bg-[var(--sellekni-logo-mono)] [mask:url(/brand/mark-mono.png)_center/contain_no-repeat]', className)} />
  );
}

/** Mark + name (one name, Latin script, in every language). `size` picks the header or the login scale. */
export function BrandLockup({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark className={lg ? 'size-16' : 'size-9'} />
      {/* a logotype (WCAG 1.4.4 exception): capped by the viewport so 200 % text never pushes the page sideways */}
      <span className={cn('font-display font-semibold leading-none', lg ? 'text-[min(2.25rem,11vw)]' : 'text-[min(1.5rem,9vw)]')}>{BRAND.name}</span>
    </span>
  );
}
