import { notFound } from 'next/navigation';

/** Catch-all inside the locale segment: unknown URLs render the localized 404. */
export default function CatchAll() {
  notFound();
}
