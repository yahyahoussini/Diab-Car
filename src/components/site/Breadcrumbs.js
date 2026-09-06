import { Link } from '@/i18n/navigation';
import JsonLd from '@/components/site/JsonLd';
import { breadcrumbJsonLd } from '@/lib/seo';

/** items: [{ name, href (internal), url (absolute) }] — last item is the current page. */
export default function Breadcrumbs({ items = [], className = '' }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className={`text-[13px] text-text-muted ${className}`}>
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((it, i) => {
            const last = i === items.length - 1;
            return (
              <li key={i} className="inline-flex items-center gap-1.5">
                {last || !it.href ? (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'text-text-2' : ''}>
                    {it.name}
                  </span>
                ) : (
                  <Link href={it.href} className="transition-colors hover:text-accent">
                    {it.name}
                  </Link>
                )}
                {!last ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(items.filter((i) => i.url))} />
    </>
  );
}
