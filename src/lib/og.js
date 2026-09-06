import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

const fontDir = path.join(process.cwd(), 'src/assets/fonts/og');
const carDir = path.join(process.cwd(), 'public/images/cars');
let cache;

async function assets() {
  if (!cache) {
    cache = Promise.all([
      readFile(path.join(fontDir, 'fraunces-600.woff')),
      readFile(path.join(fontDir, 'manrope-500.woff')),
      readFile(path.join(fontDir, 'plex-arabic-600.woff')),
    ]).then(([fraunces, manrope, plex]) => ({ fraunces, manrope, plex }));
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

/**
 * Branded 1200×630 Open Graph card (dark, gold, zellige) shared by every page.
 * Arabic text uses IBM Plex Sans Arabic; Latin uses Fraunces + Manrope.
 */
export async function renderOg({ title, subtitle, kicker = 'diabcar.ma', locale = 'fr', car = 'suv-premium', price }) {
  const { fraunces, manrope, plex } = await assets();
  const rtl = locale === 'ar';
  const carSrc = await carDataUrl(car);
  const displayFont = rtl ? 'Plex Arabic' : 'Fraunces';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: rtl ? 'row-reverse' : 'row',
          background: 'linear-gradient(135deg, #0c0b09 0%, #1c1915 60%, #2a2419 100%)',
          color: '#f4efe6',
          fontFamily: rtl ? 'Plex Arabic' : 'Manrope',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: -120, right: -80, width: 460, height: 460, borderRadius: 999, background: 'rgba(212,178,106,0.18)', filter: 'blur(60px)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 64px', width: 700, direction: rtl ? 'rtl' : 'ltr' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="40" height="40" viewBox="0 0 32 32">
              <path d="M16 2l3.2 7.3 7.8-1.1-4.6 6.5 4.6 6.5-7.8-1.1L16 30l-3.2-7.9-7.8 1.1 4.6-6.5-4.6-6.5 7.8 1.1z" fill="#d4b26a" />
              <circle cx="16" cy="16" r="4.2" fill="#0c0b09" />
            </svg>
            <div style={{ display: 'flex', fontFamily: 'Fraunces', fontSize: 30, letterSpacing: 1 }}>
              <span>DIAB </span>
              <span style={{ color: '#d4b26a', marginLeft: 8 }}>CAR</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 18, color: '#d4b26a', letterSpacing: rtl ? 0 : 3, textTransform: rtl ? 'none' : 'uppercase' }}>{kicker}</div>
            <div style={{ fontFamily: displayFont, fontSize: title.length > 40 ? 46 : 58, lineHeight: 1.1, textWrap: 'balance' }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 22, color: '#b9ae9c', lineHeight: 1.4 }}>{subtitle}</div> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 18, color: '#b9ae9c' }}>
            {price ? <div style={{ display: 'flex', padding: '8px 16px', borderRadius: 999, background: '#d4b26a', color: '#14120f', fontWeight: 700 }}>{price}</div> : null}
            <div>Casablanca · Aéroport Mohammed V</div>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          {carSrc ? <img src={carSrc} width={480} height={228} style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.6))' }} /> : null}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' },
        { name: 'Manrope', data: manrope, weight: 500, style: 'normal' },
        { name: 'Plex Arabic', data: plex, weight: 600, style: 'normal' },
      ],
    },
  );
}
