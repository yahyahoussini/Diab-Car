'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mergeCustomersAction } from '@/lib/actions/customers';
import { formatDate, formatPhone } from '@/lib/format';

/**
 * Two files, one human (plan 7.1).
 *
 * A phone number typed as `+212612345678` on the site and as `0612345678` at
 * the counter makes two customers that the UNIQUE constraint cannot see are
 * the same person — so the history splits, and the agent on the phone tells a
 * returning client they have never rented from us.
 *
 * The merge is deliberately not a one-click button: the operator picks WHICH
 * file survives and writes why, because the other one is deleted and its
 * reservations move. Both facts are in the journal afterwards.
 */
export default function MergeDuplicates({ groups, canMerge, base }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState(null);
  const [keepId, setKeepId] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const open = (group) => {
    setOpenKey(group.key);
    /* Default to the file with the most history: it is the one whose id is
       already on the most reservations, so the merge moves the fewest rows. */
    setKeepId([...group.customers].sort((a, b) => (b.reservations || 0) - (a.reservations || 0))[0]?.id || null);
    setReason('');
    setMessage(null);
  };

  const submit = async (group) => {
    const others = group.customers.filter((c) => c.id !== keepId);
    if (!keepId || others.length === 0 || !reason.trim()) {
      setMessage('Choisissez la fiche à conserver et écrivez un motif.');
      return;
    }
    setBusy(true);
    /* One call per file being folded in, so a three-way duplicate resolves in
       one gesture and each merge is audited on its own. */
    for (const other of others) {
      const result = await mergeCustomersAction({ keepId, dropId: other.id, reason: reason.trim() });
      if (!result?.ok) {
        setBusy(false);
        setMessage(describe(result));
        return;
      }
    }
    setBusy(false);
    setOpenKey(null);
    setMessage(`${others.length} fiche(s) fusionnée(s).`);
    router.refresh();
  };

  return (
    <section className="rounded-lg border border-warning bg-warning-soft/20 p-5" data-testid="duplicates">
      <h2 className="text-sm font-semibold text-text">
        {groups.length} numéro{groups.length > 1 ? 's' : ''} en double
      </h2>
      <p className="mt-1 text-xs text-text-2">
        Le même téléphone écrit de deux façons. L’historique de ces clients est coupé en deux tant qu’ils ne sont pas fusionnés.
      </p>

      {message ? (
        <p className="mt-3 rounded border border-border-strong bg-surface-1 p-2 text-sm text-text" role="status">
          {message}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {groups.map((group) => (
          <li key={group.key} className="rounded border border-border bg-surface-1 p-4" data-group={group.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="tnum font-latin-sans text-sm text-text">…{group.key}</span>
              {canMerge ? (
                <button
                  type="button"
                  onClick={() => (openKey === group.key ? setOpenKey(null) : open(group))}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text"
                >
                  {openKey === group.key ? 'Annuler' : 'Fusionner'}
                </button>
              ) : (
                <span className="text-xs text-text-muted">Fusion réservée au responsable.</span>
              )}
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {group.customers.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-3">
                  {openKey === group.key ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`keep-${group.key}`}
                        checked={keepId === c.id}
                        onChange={() => setKeepId(c.id)}
                        className="h-4 w-4 accent-red"
                        data-keep={c.id}
                      />
                      <span className="text-xs text-text-muted">conserver</span>
                    </label>
                  ) : null}
                  <Link href={`${base}/clients/${c.id}`} className="font-semibold text-text hover:underline">
                    {`${c.firstName} ${c.lastName}`.trim() || '—'}
                  </Link>
                  <bdi className="font-latin-sans text-text-2">{formatPhone(c.phone)}</bdi>
                  <span className="text-text-muted">{c.email || '—'}</span>
                  <span className="tnum text-text-muted">{c.reservations} location(s)</span>
                  <span className="tnum text-text-muted">{c.createdAt ? formatDate(c.createdAt, 'fr') : ''}</span>
                </li>
              ))}
            </ul>

            {openKey === group.key ? (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1">
                  <span className="mb-1 block text-xs text-text-muted">Motif (obligatoire, écrit au journal)</span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Même client, numéro saisi deux fois"
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit(group)}
                  data-testid="merge-confirm"
                  className="rounded-lg bg-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Fusionner {group.customers.length - 1} fiche(s)
                </button>
                <p className="w-full text-xs text-text-muted">
                  Les réservations sont déplacées sur la fiche conservée, puis les autres fiches sont supprimées. Irréversible.
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function describe(result) {
  switch (result?.error) {
    case 'REASON_REQUIRED':
      return 'Un motif est obligatoire.';
    case 'FORBIDDEN':
      return 'Votre rôle ne permet pas de fusionner des fiches.';
    case 'NOT_FOUND':
      return 'Une des fiches n’existe plus — rechargez la page.';
    case 'SAME':
      return 'Choisissez deux fiches différentes.';
    default:
      return `Fusion refusée : ${result?.error || 'inconnu'}.`;
  }
}
