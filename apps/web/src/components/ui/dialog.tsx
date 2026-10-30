'use client';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Centered dialog for short, deliberate inputs (a reason, a pasted SMS). Detail views use the drawer, never this. */
export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  const t = useTranslations('app');
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-bg/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content
          className={cn(
            'fixed start-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-y-1/2 flex-col gap-4 overflow-y-auto',
            'ltr:-translate-x-1/2 rtl:translate-x-1/2 rounded-lg border border-line bg-surface p-5 text-text shadow-2xl',
            className,
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <D.Title className="text-xl font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-base text-muted-foreground">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close className="-me-2 -mt-2 inline-flex size-12 items-center justify-center rounded-md hover:bg-raised" aria-label={t('close')}>
              <X aria-hidden className="size-5" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Text area / input styles shared by the dialogs (tokens only). */
export const fieldCls = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-base text-text placeholder:text-muted-foreground';
