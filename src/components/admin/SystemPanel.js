import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { Card, Notice, SubmitButton, Table } from '@/components/admin/ui';

/**
 * Observability of the free tier (plan 9.6).
 *
 * The whole point of this page is that "gratuit" never surprises anyone, so it
 * only shows numbers it can actually read. Two of the five limits plan 9.6
 * lists — Workers requests and the Resend quota — are NOT readable from this
 * app: each needs its own API token with its own scope, and neither token is
 * configured. Those two get a sentence saying where the number lives instead
 * of a number, because an invented gauge on a page whose job is to warn you
 * would be worse than no gauge at all (rule 11).
 *
 * Server component on purpose: nothing here is interactive. The one button —
 * push notifications — is disabled because the transport does not exist yet,
 * and a disabled button needs no JavaScript.
 */

const KIB = 1024;
const MIB = KIB * KIB;
const GIB = MIB * KIB;

/* Supabase Free, region eu-west-3 (plan 9.2): Postgres 500 MB, Storage 1 GB. */
const DB_LIMIT = 500 * MIB;
const STORAGE_LIMIT = GIB;

/* The buckets created by supabase/migrations/0006. Listed even when the RPC
   returns nothing for them: `storage.objects` has no row for an empty bucket,
   and a bucket silently missing from the table reads as a bug, not as zero. */
const BUCKETS = [
  ['vehicles', 'Photos de la flotte'],
  ['inspections', 'Photos d’état des lieux'],
  ['documents', 'Pièces jointes clients'],
];

const COUNT_LABELS = [
  ['vehicles', 'Modèles'],
  ['units', 'Unités (plaques)'],
  ['reservations', 'Réservations'],
  ['customers', 'Clients'],
  ['events', 'Événements véhicule'],
  ['auditRows', 'Lignes de journal'],
  ['unreadNotifications', 'Notifications non lues'],
  ['pushSubscriptions', 'Appareils abonnés au push'],
];

const N0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const N2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Octets → « 12,4 Mo ». Local and dependency-free: one call site, four units. */
function formatBytes(bytes) {
  const n = Number(bytes);
  if (bytes == null || !Number.isFinite(n)) return '—';
  if (n < KIB) return `${N0.format(n)} o`;
  if (n < MIB) return `${N0.format(n / KIB)} Ko`;
  if (n < GIB) return `${N1.format(n / MIB)} Mo`;
  return `${N2.format(n / GIB)} Go`;
}

function formatCount(n) {
  return Number.isFinite(Number(n)) ? N0.format(Number(n)) : '—';
}

/**
 * A quota bar. `value` may be null — that is the honest state in demo mode and
 * whenever the RPC could not measure — and then the bar stays empty and says
 * so rather than drawing a reassuring 0 %.
 */
function Meter({ label, value, limit, limitLabel }) {
  const n = Number(value);
  const known = value != null && Number.isFinite(n);
  const pct = known ? (n / limit) * 100 : 0;
  const shown = Math.min(100, Math.max(pct, pct > 0 ? 1.5 : 0)); // a hair of fill so "presque rien" is still visible
  const tone = pct >= 85 ? 'bg-danger' : pct >= 60 ? 'bg-warning' : 'bg-success';

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-text-2">{label}</span>
        <span className="tnum text-sm text-text">
          {known ? formatBytes(n) : 'Non mesuré'} <span className="text-text-muted">/ {limitLabel}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(pct) : undefined}
        aria-valuetext={known ? `${N1.format(pct)} %` : 'non mesuré'}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={cn('h-full rounded-full', known ? tone : 'bg-transparent')} style={{ inlineSize: `${shown}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        {known ? (
          <>
            <span className="tnum">{N1.format(pct)} %</span> du quota gratuit
          </>
        ) : (
          'Taille indisponible ici.'
        )}
      </p>
    </div>
  );
}

/** A dense label/number cell — plan 7.3 asks for thin dividers, not nine cards. */
function CountCell({ label, value, tone }) {
  return (
    <div className="bg-surface-1 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted">{label}</div>
      <div className={cn('tnum mt-1 font-latin-sans text-xl', tone === 'accent' ? 'text-accent' : 'text-text')}>{value}</div>
    </div>
  );
}

export default function SystemPanel({ metrics, base = '/admin' }) {
  const demo = Boolean(metrics?.demo);
  const counts = metrics?.counts || {};

  /* Copied before sorting: mutating a prop array is exactly what the compiler
     lint refuses, and the RPC's own ordering is not a contract. */
  const tables = [...(metrics?.tables || [])].sort((a, b) => Number(b?.bytes || 0) - Number(a?.bytes || 0)).slice(0, 5);

  const reported = metrics?.storage || [];
  const buckets = demo
    ? []
    : [
        ...BUCKETS.map(([id, note]) => {
          const row = reported.find((r) => r?.bucket === id);
          return { bucket: id, note, objects: Number(row?.objects || 0), bytes: Number(row?.bytes || 0) };
        }),
        /* Anything Supabase itself created (avatars, temp) still shows up: the
           1 Go is shared, so a bucket we did not declare still counts. */
        ...reported
          .filter((r) => r?.bucket && !BUCKETS.some(([id]) => id === r.bucket))
          .map((r) => ({ bucket: r.bucket, note: 'Bucket hors migration', objects: Number(r.objects || 0), bytes: Number(r.bytes || 0) })),
      ];

  const storageBytes = demo ? null : buckets.reduce((sum, b) => sum + b.bytes, 0);
  const storageObjects = buckets.reduce((sum, b) => sum + b.objects, 0);

  const lastBackupAt = metrics?.lastBackupAt || null;
  /* `metrics.now` is the database clock, handed down by the page. Reading the
     clock here would be a render-time side effect the compiler rejects. */
  const backupAgeDays =
    lastBackupAt && metrics?.now ? Math.max(0, Math.floor((new Date(metrics.now) - new Date(lastBackupAt)) / 86400000)) : null;

  const pushCount = Number(counts.pushSubscriptions || 0);

  return (
    <div className="space-y-5">
      {demo ? (
        <Notice tone="info">
          Mode démo : les données vivent en mémoire, il n’y a ni Postgres ni bucket Supabase à mesurer. Les compteurs ci-dessous sont
          réels, les tailles ne le sont pas.
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Base de données">
          <Meter label="Postgres" value={metrics?.databaseBytes} limit={DB_LIMIT} limitLabel="500 Mo" />
          <p className="mt-2 text-xs text-text-muted">
            Plan gratuit Supabase, région eu-west-3 (plan 9.2). Au-delà, il faut faire de la place ou passer au plan Pro.
          </p>

          <h3 className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">Les cinq plus grosses tables</h3>
          {tables.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-2">
              Aucune table mesurée. {demo ? 'Le mode démo n’a pas de base à interroger.' : 'La fonction system_metrics() n’a rien renvoyé.'}
            </p>
          ) : (
            <Table head={['Table', 'Taille', 'Lignes (estim.)']} className="[&_table]:min-w-0">
              {tables.map((t) => (
                <tr key={t.name}>
                  <td className="px-4 py-2 font-latin-sans text-text">{t.name}</td>
                  <td className="tnum px-4 py-2 text-text-2">{formatBytes(t.bytes)}</td>
                  <td className="tnum px-4 py-2 text-text-muted">{formatCount(Math.max(0, Number(t.rows || 0)))}</td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-2 text-xs text-text-muted">
            Le nombre de lignes vient de <span className="font-latin-sans">reltuples</span> : c’est l’estimation du planificateur, pas un
            comptage.
          </p>
        </Card>

        <Card title="Stockage">
          <Meter label="Fichiers (tous buckets)" value={storageBytes} limit={STORAGE_LIMIT} limitLabel="1 Go" />
          <p className="mt-2 text-xs text-text-muted">
            {demo
              ? 'Le mode démo n’écrit aucun fichier.'
              : `${formatCount(storageObjects)} objet${storageObjects > 1 ? 's' : ''} au total. Au-delà de 800 Mo, plan 9.2 : déplacer les photos d’état des lieux vers R2.`}
          </p>

          <h3 className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">Par bucket</h3>
          {buckets.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-2">
              Aucun bucket à mesurer{demo ? ' en mode démo' : ''}.
            </p>
          ) : (
            <Table head={['Bucket', 'Objets', 'Taille']} className="[&_table]:min-w-0">
              {buckets.map((b) => (
                <tr key={b.bucket}>
                  <td className="px-4 py-2">
                    <span className="font-latin-sans text-text">{b.bucket}</span>
                    <span className="block text-xs text-text-muted">{b.note}</span>
                  </td>
                  <td className="tnum px-4 py-2 text-text-2">{formatCount(b.objects)}</td>
                  <td className="tnum px-4 py-2 text-text-2">{formatBytes(b.bytes)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card title="Compteurs">
        {/* gap-px over the border colour: thin dividers without a border on
            every cell (plan 7.3). */}
        <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          <CountCell label="Réservations créées aujourd’hui" value={formatCount(metrics?.reservationsToday ?? 0)} tone="accent" />
          {COUNT_LABELS.map(([key, label]) => (
            <CountCell key={key} label={label} value={formatCount(counts[key] ?? 0)} />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Sauvegarde">
          {lastBackupAt ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted">Dernière sauvegarde enregistrée</div>
              <div className="tnum mt-1 font-latin-sans text-xl text-text">{formatDateTime(lastBackupAt, 'fr')}</div>
              {backupAgeDays === null ? null : (
                <div className="mt-1 text-xs text-text-muted">
                  {backupAgeDays === 0 ? 'aujourd’hui' : `il y a ${N0.format(backupAgeDays)} jour${backupAgeDays > 1 ? 's' : ''}`}
                </div>
              )}
              {backupAgeDays !== null && backupAgeDays > 7 ? (
                <p className="mt-3 text-sm text-red-signal">Plus de sept jours. Le plan gratuit Supabase ne sauvegarde rien tout seul.</p>
              ) : null}
            </>
          ) : (
            <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text-2">Jamais enregistrée.</p>
          )}
          <p className="mt-3 text-sm text-text-2">
            Cette date est saisie à la main dans{' '}
            <Link href={`${base}/parametres`} className="text-accent hover:underline">
              Paramètres
            </Link>{' '}
            pour l’instant : rien ne l’écrit automatiquement depuis ce panneau.
          </p>
        </Card>

        <Card title="Notifications push">
          <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted">Appareils abonnés</div>
          <div className="tnum mt-1 font-latin-sans text-xl text-text">{formatCount(pushCount)}</div>
          {pushCount === 0 ? <div className="mt-1 text-xs text-text-muted">Aucun abonnement enregistré.</div> : null}
          <p className="mt-3 text-sm text-text-2">
            Le transport Web Push n’est pas encore construit : les clés VAPID se génèrent déjà avec{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-latin-sans text-xs text-text">npm run vapid</code>, mais le service
            worker qui reçoit et l’envoyeur qui pousse n’existent pas.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SubmitButton type="button" variant="secondary" disabled aria-disabled="true">
              Activer les notifications
            </SubmitButton>
            <span className="text-xs text-text-muted">Désactivé : service worker et envoyeur à construire (prompt ultérieur).</span>
          </div>
        </Card>
      </div>

      <Card title="Requêtes et quota e-mail">
        {/* Plan 9.6 asks for these two numbers. They are not readable from
            here, and the page says why rather than showing a plausible
            invention (rule 11). */}
        <p className="text-sm text-text-2">
          Ces deux compteurs ne sont pas lisibles depuis cette application. Chacun demande un jeton d’API distinct, qu’aucune variable
          d’environnement ne fournit aujourd’hui.
        </p>
        <dl className="mt-4 divide-y divide-border border-y border-border">
          <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
            <dt className="text-sm font-semibold text-text">Requêtes Cloudflare Workers</dt>
            <dd className="text-sm text-text-2">
              Limite du plan gratuit : <span className="tnum">{N0.format(100000)}</span> requêtes par jour (plan 9.2). Le nombre consommé se lit dans
              le tableau de bord Cloudflare, sur le Worker qui sert le site. L’afficher ici demanderait un jeton d’API Cloudflare autorisé
              à lire les analytics du compte : aucun n’est configuré.
            </dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
            <dt className="text-sm font-semibold text-text">E-mails Resend</dt>
            <dd className="text-sm text-text-2">
              Limite du plan gratuit : <span className="tnum">{N0.format(3000)}</span> e-mails par mois (plan 9.2). Le total envoyé se lit dans le
              tableau de bord Resend. La seule clé configurée ici (<span className="font-latin-sans">RESEND_API_KEY</span>) sert à envoyer ;
              lire le quota du compte demande une clé avec un autre droit, qui n’existe pas.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-text-muted">
          Aucun de ces deux chiffres n’est estimé ici. Tant qu’un jeton n’est pas ajouté, la vérification reste mensuelle et manuelle.
        </p>
      </Card>
    </div>
  );
}
