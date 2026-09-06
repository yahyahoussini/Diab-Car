/** Renders one or more JSON-LD graphs safely. */
export default function JsonLd({ data }) {
  const list = Array.isArray(data) ? data : [data];
  return list
    .filter(Boolean)
    .map((d, i) => (
      <script
        key={i}
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, '\\u003c') }}
      />
    ));
}
