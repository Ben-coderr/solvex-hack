'use client';
import { packetView, type PacketToken } from '@najda/ui-core';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cn } from '@/lib/utils';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const KIND_STYLE: Partial<Record<PacketToken['kind'], string>> = {
  magic: 'text-muted-foreground',
  id: 'font-semibold',
  assessment: 'font-semibold',
  crc: 'text-muted-foreground',
};

export interface PacketChipProps {
  token: PacketToken;
  copyable?: boolean;
}

/** One DZ-MSD token as a monospace chip ("the packet IS the UI"). Tap to copy. */
export function PacketChip({ token, copyable = true }: PacketChipProps) {
  const t = useTranslations('packet');
  const [done, setDone] = useState(false);
  const cls = cn(
    'inline-flex min-h-8 max-w-full items-center break-all rounded-sm border px-1.5 font-mono text-[0.9375rem] leading-none tracking-tight',
    'border-line bg-raised text-text',
    KIND_STYLE[token.kind],
    token.state === 'suspect' && 'border-dashed border-status-warn',
    token.state === 'invalid' && 'border-status-danger text-status-danger',
  );
  if (!copyable) return <span className={cls} data-kind={token.kind}>{token.text}</span>;
  return (
    <button
      type="button"
      className={cn(cls, 'cursor-copy hover:border-brand-fill')}
      data-kind={token.kind}
      aria-label={t('copyToken', { token: token.text })}
      onClick={async () => setDone(await copy(token.text))}
      onBlur={() => setDone(false)}
    >
      {token.text}
      {done && <Check aria-hidden className="ms-1 size-3.5 text-status-ok" />}
    </button>
  );
}

export interface PacketLineProps {
  /** the exact text that travelled (SMS body or the server's re-encoding) */
  wire: string;
  className?: string;
  /** chips copy individually; the whole line always has a copy button */
  chipsCopyable?: boolean;
}

/** Full packet: chips that wrap, "93/160" counter, GSM-7 badge, and the decoder's verdict. Always LTR. */
export function PacketLine({ wire, className, chipsCopyable = true }: PacketLineProps) {
  const t = useTranslations('packet');
  const v = packetView(wire);
  const [copied, setCopied] = useState(false);
  const fits = v.length !== null && v.length <= v.max;
  const badge = v.length === null ? t('notGsm7') : !fits ? t('tooLong') : t('gsm7');
  const verdict = v.decoded.ok
    ? null
    : v.decoded.code === 'checksum_mismatch'
      ? t('crcInvalid')
      : t('invalid', { code: v.decoded.code });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="packet-ltr font-mono tabular-nums text-muted-foreground">
          {t('counter', { length: v.length ?? wire.length, max: v.max })}
        </span>
        <span
          className={cn(
            'rounded-pill border px-2 py-0.5 font-mono text-xs',
            fits && v.basicGsm7 ? 'border-line text-muted-foreground' : 'border-status-danger text-status-danger',
          )}
        >
          {badge}
        </span>
        <button
          type="button"
          onClick={async () => setCopied(await copy(wire))}
          className="ms-auto inline-flex min-h-12 items-center gap-1.5 rounded-sm px-3 text-sm text-brand-text hover:underline"
        >
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <p className="packet-ltr flex flex-wrap gap-1" dir="ltr" aria-label={wire}>
        {v.tokens.map((tok, i) => (
          <PacketChip key={`${i}-${tok.text}`} token={tok} copyable={chipsCopyable} />
        ))}
      </p>
      {verdict && <p className="text-sm text-status-danger">{verdict}</p>}
    </div>
  );
}
