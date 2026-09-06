/**
 * Minimal, dependency-free Markdown renderer for editorial content:
 * headings (##, ###), paragraphs, bullet lists, bold, italics, links.
 * Output is React elements (no dangerouslySetInnerHTML).
 */
function inline(text, key) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={`${key}-b${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('[')) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      parts.push(
        <a key={`${key}-a${i++}`} href={href} className="text-accent underline underline-offset-4" target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
          {label}
        </a>,
      );
    } else parts.push(<em key={`${key}-i${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function readingTime(markdown = '') {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default function Markdown({ source = '', className = '' }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className={`prose-dc ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim().length);
        if (!lines.length) return null;
        if (lines[0].startsWith('### ')) return <h3 key={bi}>{inline(lines[0].slice(4), bi)}</h3>;
        if (lines[0].startsWith('## ')) return <h2 key={bi}>{inline(lines[0].slice(3), bi)}</h2>;
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^[-*] /, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\d+\. /, ''), `${bi}-${li}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={bi}>{inline(lines.join(' '), bi)}</p>;
      })}
    </div>
  );
}
