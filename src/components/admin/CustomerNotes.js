'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCustomerNotes } from '@/lib/actions/customers';

/**
 * The note an agent leaves for the next agent (plan 7.1).
 *
 * Free text on purpose — "prefers the airport, always late, pays cash" is not
 * a field, and forcing it into one would just move it to a Post-it. It is
 * staff-only data and it never reaches the public site.
 */
export default function CustomerNotes({ id, notes }) {
  const router = useRouter();
  const [value, setValue] = useState(notes || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  return (
    <form
      data-testid="customer-notes"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const result = await saveCustomerNotes({ id, notes: value });
        setBusy(false);
        setMessage(result?.ok ? 'Note enregistrée.' : 'Enregistrement refusé.');
        if (result?.ok) router.refresh();
      }}
    >
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Notes internes</span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Visible par l’équipe seulement."
          className="mt-2 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text disabled:opacity-50">
          Enregistrer
        </button>
        {message ? (
          <span className="text-sm text-text-muted" role="status">
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
