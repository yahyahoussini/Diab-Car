import Breadcrumbs from '@/components/site/Breadcrumbs';

/** Shared shell for terms / legal notice / privacy pages. */
export default function LegalPage({ crumbs, title, subtitle, sections = [], children }) {
  return (
    <div className="pt-[calc(var(--header-h)+1.5rem)] pb-24">
      <div className="container-x max-w-3xl">
        <Breadcrumbs items={crumbs} />
        <h1 className="mt-8 text-display-2 text-text">{title}</h1>
        {subtitle ? <p className="mt-3 text-sm text-text-muted">{subtitle}</p> : null}
        <div className="prose-dc mt-8">
          {children}
          {sections.map((s, i) => (
            <section key={i}>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
