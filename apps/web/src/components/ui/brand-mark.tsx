import { cn } from '@/lib/utils';
import { BRAND } from '@/brand';

/**
 * The Sellekni mark, single-colour inside the product (docs/06 §11): a white mask (scripts/make-brand.py) filled
 * with the `logoMono` token, so it follows light/dark. The red logo is for the favicon / app icon only.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden
      className={cn('inline-block shrink-0 bg-[var(--najda-logo-mono)] [mask:url(/brand/mark-mono.png)_center/contain_no-repeat]', className)} />
  );
}

/** Mark + name (one name, Latin script, in every language). `size` picks the header or the login scale. */
export function BrandLockup({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark className={lg ? 'size-16' : 'size-9'} />
      <span className={cn('font-display font-semibold leading-none', lg ? 'text-4xl' : 'text-2xl')}>{BRAND.name}</span>
    </span>
  );
}
