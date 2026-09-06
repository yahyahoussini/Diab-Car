/**
 * Hero headline — one masked line per string (plan 4.2: two lines maximum).
 *
 * The reveal is the `.hero-line` keyframe from globals.css: a `translateY`
 * inside `.line-mask`'s `overflow:hidden`. It animates **transform only and
 * never opacity**, so the headline is painted at full opacity at frame 0 —
 * Chrome discards `opacity:0` elements as LCP candidates (plan 5.2), and a
 * reader who never gets the JS still sees the title. Under
 * `prefers-reduced-motion` globals.css pins it to its end state.
 *
 * @param {object} props
 * @param {string[]} props.lines Visual lines, already localized.
 * @param {string} [props.className] Type scale + colour, e.g. `"text-display-1 text-text"`.
 * @param {string} [props.id] So an `aria-labelledby` elsewhere can point at the h1.
 * @returns {JSX.Element}
 */
export default function HeroTitle({ lines = [], className, id }) {
  return (
    <h1 id={id} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="line-mask">
          {/* Only the 80 ms stagger is inline. The duration stays in globals.css
              so `[data-ignition="seen"]` can shorten the whole ignition. */}
          <span className="hero-line" style={i ? { animationDelay: `${i * 0.08}s` } : undefined}>
            {line}
          </span>
        </span>
      ))}
    </h1>
  );
}

/**
 * Above-the-fold fade/rise (CSS only, `.eager-rise`). Keep the LCP image and
 * the headline out of it: this one does start at `opacity:0`.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {number} [props.delay] Seconds before the rise starts.
 * @param {string} [props.className]
 * @param {keyof JSX.IntrinsicElements} [props.as] Element to render, default `div`.
 * @returns {JSX.Element}
 */
export function FadeIn({ children, delay = 0, className, as: Tag = 'div' }) {
  return (
    <Tag className={`eager-rise ${className || ''}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </Tag>
  );
}
