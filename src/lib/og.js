import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

const fontDir = path.join(process.cwd(), 'src/assets/fonts/og');
const carDir = path.join(process.cwd(), 'public/images/cars');
let cache;

/**
 * satori (behind next/og) reads WOFF / TTF / OTF but NOT WOFF2, which is why a
 * static Archivo .woff is vendored here rather than reusing the variable
 * woff2 that the site itself loads.
 */
async function assets() {
  if (!cache) {
    cache = Promise.all([
      readFile(path.join(fontDir, 'archivo-700.woff')),
      readFile(path.join(fontDir, 'manrope-500.woff')),
      readFile(path.join(fontDir, 'plex-arabic-600.woff')),
    ]).then(([archivo, manrope, plex]) => ({ archivo, manrope, plex }));
  }
  return cache;
}

async function carDataUrl(name) {
  try {
    const svg = await readFile(path.join(carDir, `${name}.svg`), 'utf8');
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return null;
  }
}

/* BLACKLINE palette, spelled out because satori runs outside the browser and
   cannot read a CSS custom property. Values are plan section 2.2, dark mode. */
const BG = '#080808';
const TEXT = '#ffffff';
const TEXT_2 = '#a5a5a5';
const RED = '#c80018'; /* the logo's red; fill only — white on it is 6.05:1 */
const RED_SIGNAL = '#f0383f'; /* thin lines and red text on #080808: 5.10:1 */

/* The real Diab Car mark (white cut, for the black card ground), read once and
   inlined as a data URL — satori cannot fetch, but it renders <img> from data:. */
let markCache;
async function markDataUrl() {
  if (!markCache) {
    markCache = readFile(path.join(process.cwd(), 'public/brand/mark-white.png'))
      .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
      .catch(() => null);
  }
  return markCache;
}

/** The mark is 2.59:1; size by height so it never distorts. */
function Badge({ src, height = 40 }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- satori renders outside the browser; next/image does not apply
  return <img src={src} alt="" height={height} width={Math.round(height * 2.59)} style={{ display: 'flex' }} />;
}

/**
 * Branded 1200×630 Open Graph card, BLACKLINE: black ground, white Archivo
 * title, one red line, Manrope subtitle, badge in the corner. Arabic cards
 * keep IBM Plex Sans Arabic and are never uppercased or letter-spaced.
 */
export async function renderOg({ title, subtitle, kicker = 'diabcar.ma', locale = 'fr', car = 'suv-premium', price }) {
  const { archivo, manrope, plex } = await assets();
  const rtl = locale === 'ar';
  const [carSrc, markSrc] = await Promise.all([carDataUrl(car), markDataUrl()]);
  const displayFont = rtl ? 'Plex Arabic' : 'Archivo';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: rtl ? 'row-reverse' : 'row',
          background: BG,
          color: TEXT,
          fontFamily: rtl ? 'Plex Arabic' : 'Manrope',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 64px',
            width: 700,
            direction: rtl ? 'rtl' : 'ltr',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge src={markSrc} />
            <div
              style={{
                display: 'flex',
                fontFamily: 'Archivo',
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: 1.4,
                color: TEXT,
              }}
            >
              DIAB CAR
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* The Red Line (plan 2.4) — the one brand motif, 2px, deliberate. */}
            <div style={{ display: 'flex', width: 120, height: 2, background: RED_SIGNAL }} />
            <div
              style={{
                display: 'flex',
                fontSize: 17,
                color: TEXT_2,
                letterSpacing: rtl ? 0 : 3,
                textTransform: rtl ? 'none' : 'uppercase',
              }}
            >
              {kicker}
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: displayFont,
                fontWeight: rtl ? 600 : 700,
                fontSize: title.length > 40 ? 50 : 62,
                lineHeight: 1.05,
                letterSpacing: rtl ? 0 : -0.6,
                textTransform: rtl ? 'none' : 'uppercase',
              }}
            >
              {title}
            </div>
            {subtitle ? <div style={{ display: 'flex', fontSize: 22, color: TEXT_2, lineHeight: 1.4 }}>{subtitle}</div> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 18, color: TEXT_2 }}>
            {price ? (
              <div style={{ display: 'flex', padding: '8px 16px', borderRadius: 999, background: RED, color: TEXT, fontWeight: 700 }}>{price}</div>
            ) : null}
            <div style={{ display: 'flex' }}>Casablanca · Aéroport Mohammed V</div>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori, not the browser */}
          {carSrc ? <img src={carSrc} alt="" width={480} height={228} /> : null}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Archivo', data: archivo, weight: 700, style: 'normal' },
        { name: 'Manrope', data: manrope, weight: 500, style: 'normal' },
        { name: 'Plex Arabic', data: plex, weight: 600, style: 'normal' },
      ],
    },
  );
}
