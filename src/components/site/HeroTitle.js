/**
 * Masked line reveal driven by CSS keyframes — visible within the first second
 * without waiting for hydration, so the LCP is never delayed by JavaScript.
 */
export default function HeroTitle({ lines = [], className }) {
  return (
    <h1 className={className}>
      {lines.map((line, i) => (
        <span key={i} className="line-mask">
          <span className={`hero-line ${i === lines.length - 1 ? 'text-text' : ''}`} style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
            {line}
          </span>
        </span>
      ))}
    </h1>
  );
}

/** Above-the-fold fade/rise (CSS only). Keep the LCP text out of it. */
export function FadeIn({ children, delay = 0, className, as: Tag = 'div' }) {
  return (
    <Tag className={`eager-rise ${className || ''}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </Tag>
  );
}
