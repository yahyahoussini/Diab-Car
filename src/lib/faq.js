/**
 * Keeping unwritten answers off the public site (CLAUDE.md rule 11:
 * "Only verifiable facts render on the site. Unverified = hidden, not
 * invented").
 *
 * `docs/inputs/faq.csv` ships as a TEMPLATE — every answer in it reads
 * "TODO — réponse complète" until Diab Car writes the real one. On 2026-09-10
 * exactly one of those rows was published in the live database, and the
 * placeholder was rendering on seven public pages: the FAQ page in all four
 * languages, and the FAQ block on each homepage. Worse, it was inside the
 * FAQPage structured data as
 *
 *     "acceptedAnswer": { "@type": "Answer", "text": "TODO — réponse complète" }
 *
 * which is the text Google would have indexed and shown as the agency's own
 * answer.
 *
 * The guard lives at the data layer rather than in the FAQ page, because the
 * rows are read by four callers — the FAQ page, both homepages' FAQ blocks, the
 * airport page and the vehicle page — and a filter in one of them protects only
 * that one. The admin deliberately still sees these rows: hiding them from the
 * owner would remove the only place they can be found and finished.
 */

/**
 * Openers that mean "nobody has written this yet". Anchored at the start, so a
 * real answer that happens to contain the word — "…todo incluido" in Spanish,
 * which is simply "all-inclusive" — is never mistaken for one. That false
 * positive is not hypothetical: a naive /todo/i match flagged the Spanish
 * homepage and fleet page, both of which are correct copy.
 */
const PLACEHOLDER = /^\s*(?:todo\b|tbd\b|fixme\b|xxx+|lorem ipsum|à compléter|a completer|por completar|pendiente de completar|قيد الإنجاز)/i;

/** True when a single localized string is missing or is still a placeholder. */
export function isPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  if (!text) return true;
  return PLACEHOLDER.test(text);
}

/**
 * Every string inside a `{ fr, en, ar, es }` bag, or a plain string.
 * A row is judged on ALL of its languages, not just the reference one: an
 * English page falls back to the French value when its own is empty, so a
 * placeholder in any language can reach a reader.
 */
function values(field) {
  if (field === null || field === undefined) return [];
  if (typeof field === 'string') return [field];
  if (typeof field === 'object') return Object.values(field).filter((v) => typeof v === 'string');
  return [];
}

/**
 * Is this FAQ row finished enough to show a customer?
 *
 * It needs a question and a short answer, and no part of it — including the
 * long answer, which is what the structured data carries — may still be a
 * placeholder. An entry that fails is dropped whole rather than shown with a
 * blank answer: a question the site refuses to answer reads worse than a
 * question it never asked.
 */
export function isAnswered(faq) {
  if (!faq) return false;

  const question = values(faq.question);
  const short = values(faq.shortAnswer ?? faq.short_answer);
  const long = values(faq.longAnswer ?? faq.long_answer);

  if (question.length === 0 || question.every(isPlaceholder)) return false;
  if (short.length === 0 || short.every(isPlaceholder)) return false;

  /* Any single placeholder anywhere disqualifies it: the locale that holds it
     is the locale that would render it. */
  return ![...question, ...short, ...long].some(isPlaceholder);
}

/** The rows that are safe to publish. */
export function publishable(faqs = []) {
  return faqs.filter(isAnswered);
}
