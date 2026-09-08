'use client';

import { useState, useTransition } from 'react';
import { indexNowAll, revalidateAll } from '@/lib/actions/admin';
import { Card, SubmitButton } from '@/components/admin/ui';

/**
 * The three diffusion tools (plan 8.7).
 *
 * Two of them are buttons because they are HTTP calls the server can make on
 * demand: `revalidatePath` and the IndexNow ping. The third is not, and that
 * is the honest shape — the OG cards are files written into `public/og` at
 * build time (plan 9.3), so nothing a running Worker can do would produce
 * them. A button there would either lie or need a filesystem the runtime does
 * not have (rule 9). It shows the command instead.
 */

/* `npm run og`, from package.json. The script drives the RUNNING site and
   saves the bytes it gets back, so the site has to be up first — its own
   header says as much, and a command that exits with "CANNOT REACH" on the
   first try is worse than two lines that work. Two lines rather than a `&`
   because the machine that runs this is on Windows. */
const OG_COMMAND = ['# terminal 1', 'npm run build && npx next start', '', '# terminal 2', 'npm run og'].join('\n');

function Message({ state, className = 'mt-3' }) {
  if (!state) return null;
  const tone = state.tone === 'danger' ? 'text-red-signal' : state.tone === 'warning' ? 'text-warning' : 'text-success';
  return (
    <p className={`text-sm ${tone} ${className}`} role="status">
      {state.text}
    </p>
  );
}

export default function SeoTools({ hasIndexNowKey, ogCards = 0, ogLocales = 0 }) {
  /* One transition per button: pinging Bing should not grey out the cache
     button, and a shared `pending` would make the pair feel like one control. */
  const [cachePending, startCache] = useTransition();
  const [indexPending, startIndex] = useTransition();
  const [cacheMsg, setCacheMsg] = useState(null);
  const [indexMsg, setIndexMsg] = useState(null);
  const [copyMsg, setCopyMsg] = useState(null);

  function regenerate() {
    setCacheMsg(null);
    startCache(async () => {
      try {
        await revalidateAll();
        setCacheMsg({ tone: 'success', text: 'Cache du site régénéré. Les pages publiques se reconstruisent à la prochaine visite.' });
      } catch {
        setCacheMsg({ tone: 'danger', text: 'Échec de la régénération. Reconnectez-vous et réessayez.' });
      }
    });
  }

  function ping() {
    setIndexMsg(null);
    startIndex(async () => {
      try {
        const r = await indexNowAll();
        setIndexMsg(
          r.ok
            ? { tone: 'success', text: `${r.count} URLs envoyées à Bing (statut ${r.status}).` }
            : { tone: 'warning', text: `Échec : ${r.error || r.status || 'clé manquante'}.` },
        );
      } catch {
        setIndexMsg({ tone: 'danger', text: 'Échec de l’envoi. Reconnectez-vous et réessayez.' });
      }
    });
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(OG_COMMAND);
      setCopyMsg({ tone: 'success', text: 'Commande copiée.' });
    } catch {
      setCopyMsg({ tone: 'warning', text: 'Copie refusée par le navigateur — sélectionnez la commande à la main.' });
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Régénérer le cache du site">
        <p className="text-sm text-text-2">
          Invalide les pages publiques mises en cache (ISR 1 h). À lancer après une modification de véhicule, de tarif ou de contenu qui
          doit être visible tout de suite.
        </p>
        <div className="mt-4">
          <SubmitButton type="button" variant="secondary" disabled={cachePending} onClick={regenerate}>
            {cachePending ? 'Régénération…' : 'Régénérer le cache'}
          </SubmitButton>
        </div>
        <Message state={cacheMsg} />
      </Card>

      <Card title="Ping IndexNow (Bing)">
        <p className="text-sm text-text-2">
          Signale toutes les URLs publiées à Bing, dans les quatre langues : accueil, pages fixes, véhicules et articles. Bing alimente
          aussi Copilot.
        </p>
        <div className="mt-4">
          <SubmitButton type="button" disabled={indexPending || !hasIndexNowKey} onClick={ping}>
            {indexPending ? 'Envoi…' : 'Envoyer les URLs'}
          </SubmitButton>
        </div>
        {!hasIndexNowKey ? <p className="mt-3 text-sm text-text-muted">Ajoutez une clé IndexNow dans Paramètres pour activer l’envoi.</p> : null}
        <Message state={indexMsg} />
      </Card>

      <Card title="Régénérer les images OG">
        <p className="text-sm text-text-2">
          Les cartes de partage sont des fichiers PNG écrits dans <span className="font-latin-sans text-text">public/og</span> pendant le
          build (plan 9.3), pas une image calculée à chaque requête — c’est pour cela qu’il n’y a pas de bouton ici : rien dans le site en
          production ne peut écrire ces fichiers.
        </p>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">Commande à lancer en local</p>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface-2 px-3 py-2 font-latin-sans text-xs leading-5 text-text" dir="ltr">
          <code>{OG_COMMAND}</code>
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SubmitButton type="button" variant="secondary" onClick={copyCommand}>
            Copier la commande
          </SubmitButton>
          <Message state={copyMsg} className="" />
        </div>

        <p className="mt-4 text-sm text-text-muted">
          {ogCards > 0 ? (
            <>
              <span className="tnum">{ogCards}</span> cartes déjà pré-rendues{ogLocales > 0 ? <> sur <span className="tnum">{ogLocales}</span> langues</> : null}. Le script
              saute celles qui existent :{' '}
              <span className="font-latin-sans text-text-2">npm run og -- --force</span> les réécrit toutes. Ensuite, commitez{' '}
              <span className="font-latin-sans text-text-2">public/og</span> et redéployez — sans ça les nouvelles cartes ne partent pas en
              production.
            </>
          ) : (
            <>
              Aucune carte pré-rendue pour l’instant : chaque page de partage utilise la route dynamique{' '}
              <span className="font-latin-sans text-text-2">/[locale]/og</span> en attendant.
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
