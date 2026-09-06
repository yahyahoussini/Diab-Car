import { cn } from '@/lib/cn';
import Reveal from '@/components/ui/Reveal';

export default function SectionHeading({ eyebrow, title, subtitle, align = 'start', as: Tag = 'h2', className, children }) {
  return (
    <Reveal className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <Tag className="text-display-2 text-text">{title}</Tag>
      {subtitle ? <p className="mt-4 text-lg leading-relaxed text-text-2">{subtitle}</p> : null}
      {children}
    </Reveal>
  );
}
