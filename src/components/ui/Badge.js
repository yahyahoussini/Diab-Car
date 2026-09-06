import { cn } from '@/lib/cn';

const tones = {
  neutral: 'bg-surface-2 text-text-2 border-border',
  gold: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  dark: 'bg-text text-bg border-transparent',
};

export default function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] rtl:tracking-normal rtl:normal-case', tones[tone] || tones.neutral, className)}>
      {children}
    </span>
  );
}
