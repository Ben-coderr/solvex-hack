'use client';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, fieldCls } from '@/components/ui/dialog';
import { MIN_REASON_LENGTH } from '@/server/domain/lifecycle';

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** extra inputs above the reason (e.g. the band picker); `ready` = they are filled in */
  children?: ReactNode;
  ready?: boolean;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
}

/**
 * Every override and every false-alarm cancel goes through here: Confirm stays disabled until a reason of at
 * least MIN_REASON_LENGTH characters is typed (the server enforces the same rule and audits the text).
 */
export function ReasonDialog({ open, onOpenChange, title, description, children, ready = true, confirmLabel, busy, error, onConfirm }: ReasonDialogProps) {
  const t = useTranslations('override');
  const [reason, setReason] = useState('');
  const id = useId();
  const valid = reason.trim().length >= MIN_REASON_LENGTH;
  const close = (o: boolean) => {
    if (!o) setReason('');
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={close} title={title} description={description}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && ready && !busy) onConfirm(reason.trim());
        }}
      >
        {children}
        <label htmlFor={id} className="flex flex-col gap-1.5">
          <span className="text-base font-medium">{t('reason')}</span>
          <textarea
            id={id}
            name="reason"
            required
            minLength={MIN_REASON_LENGTH}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby={`${id}-hint`}
            className={fieldCls}
          />
          <span id={`${id}-hint`} className="text-sm text-muted-foreground">{t('reasonHint')}</span>
        </label>
        {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)}>{t('cancel')}</Button>
          <Button type="submit" disabled={!valid || !ready || busy}>{confirmLabel ?? t('confirm')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
