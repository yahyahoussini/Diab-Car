#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* check-contrast - WCAG 2.2 contrast audit of the design tokens.      */
/*                                                                     */
/* Zero dependencies (node:fs + node:path + node:url only). Parses     */
/* src/styles/globals.css, collects the custom properties of the light */
/* (`:root`) and the dark (`.dark`) theme - dark INHERITS from light - */
/* resolves them to RGBA (hex / rgb() / rgba() / var() indirection),   */
/* composites anything translucent, then checks the text-on-background */
/* and label-on-fill pairs declared in docs/MASTER-PLAN.md section 2.2.*/
/*                                                                     */
/* Usage:  node scripts/check-contrast.mjs [--json] [--min=4.5]        */
/*         [--no-color] [--selftest] [--help]                          */
/*                                                                     */
/* Exit:   0  every checked pair meets the threshold                   */
/*         1  at least one checked pair is below the threshold         */
/*         2  usage error, or the stylesheet could not be parsed       */
/*                                                                     */
/* Missing tokens never fail the run - they are reported instead, so a  */
/* palette can be checked before every token of section 2.2 is landed.  */
/* ------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* Resolved from the script's own location, never from process.cwd(),  */
/* so `node ../../scripts/check-contrast.mjs` works from any directory.*/
const CSS_PATH = join(HERE, '..', 'src', 'styles', 'globals.css');
const CSS_LABEL = 'src/styles/globals.css';
const PLAN_REF = 'docs/MASTER-PLAN.md section 2.2';

const AA = 4.5;
const AAA = 7;

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

/* ------------------------------------------------------------------ */
/* What gets checked (plan section 2.2)                                */
/* ------------------------------------------------------------------ */

/** Surfaces that text sits on, in both themes. */
const BACKGROUNDS = ['--bg', '--surface-1', '--surface-2'];

/**
 * Text tokens per theme. The asymmetry is deliberate and comes straight
 * from plan section 2.2: in DARK mode `--red` is a FILL-ONLY token - as
 * text on #080808 it measures 3.0:1 and fails AA - so red TEXT in dark
 * mode must use `--red-signal` (5.1:1 on #080808). Checking `--red` as
 * dark-mode text would report a failure the design never actually ships.
 */
const TEXT_TOKENS = {
  light: ['--text', '--text-2', '--text-muted', '--red'],
  dark: ['--text', '--text-2', '--text-muted', '--red-signal'],
};

/**
 * Extra text-role tokens checked in BOTH themes *when they exist*, so the
 * script is useful on a palette that has no --red /
 * --red-signal yet. Absent ones are simply not checked (not "missing").
 */
const OPTIONAL_TEXT_TOKENS = ['--accent', '--danger', '--success', '--warning', '--info'];

/**
 * Label colour on fill. A CTA label IS text, so the same 4.5:1 bar
 * applies. Plan rule encoded here: "never black text on red" - black on
 * #B71920 is 2.99:1 and fails, which is why the red pairs below test
 * #FFFFFF. Each pair is checked only when its token(s) exist.
 */
const FILL_PAIRS = [
  { fg: '--on-accent', bg: '--accent-fill' },
  /* NOT { --on-accent on --accent }: in the current palette --accent is the
     TEXT/link accent (and 1 px rules), --accent-fill is the fill. No component
     pairs bg-accent with text-on-accent - checked with
     `grep -rn "bg-accent\b" src` - so that pair would be a false 3.18:1
     failure. If a fill ever uses --accent directly, add it back here. */
  { fg: '--on-whatsapp', bg: '--whatsapp' },
  { fg: '#ffffff', bg: '--red' },
  { fg: '#ffffff', bg: '--red-hover' },
];

const THEMES = ['light', 'dark'];

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Anything that should end the run with exit code 2. */
class FatalError extends Error {}

/* ------------------------------------------------------------------ */
/* CSS parsing                                                         */
/* ------------------------------------------------------------------ */

/**
 * Strip css comments so they cannot hide or fake a declaration.
 * @param {string} css
 * @returns {string}
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Collect the top-level rules of a stylesheet, brace-matched so nested
 * blocks (`@media`, `@theme inline`, `@utility`) never leak out.
 * @param {string} css
 * @returns {{selector: string, body: string}[]}
 */
function topLevelRules(css) {
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  let blockStart = -1;
  let selector = '';
  let quote = null;

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      if (ch === quote && css[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) {
        selector = css.slice(selectorStart, i).trim();
        blockStart = i + 1;
      }
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth <= 0) {
        if (blockStart >= 0) rules.push({ selector, body: css.slice(blockStart, i) });
        depth = 0;
        blockStart = -1;
        selectorStart = i + 1;
      }
      continue;
    }
    if (ch === ';' && depth === 0) selectorStart = i + 1;
  }
  return rules;
}

/**
 * Split a rule body into `--name: value` custom properties. Splits on
 * top-level semicolons only, so `rgba(1, 2, 3, .5)` survives intact.
 * @param {string} body
 * @returns {Map<string, string>}
 */
function customProperties(body) {
  const out = new Map();
  let depth = 0;
  let quote = null;
  let start = 0;

  const take = (chunk) => {
    const text = chunk.trim();
    if (!text.startsWith('--')) return;
    const colon = text.indexOf(':');
    if (colon < 0) return;
    const name = text.slice(0, colon).trim();
    if (!/^--[\w-]+$/.test(name)) return;
    const value = text.slice(colon + 1).trim().replace(/\s*!important$/i, '').trim();
    if (value) out.set(name, value);
  };

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === quote && body[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      take(body.slice(start, i));
      start = i + 1;
    }
  }
  take(body.slice(start));
  return out;
}

/**
 * Read the stylesheet and return the two token tables.
 * @param {string} cssPath
 * @returns {{light: Map<string, string>, dark: Map<string, string>}}
 */
function readTokens(cssPath) {
  let css;
  try {
    css = readFileSync(cssPath, 'utf8');
  } catch (error) {
    throw new FatalError(`cannot read ${CSS_LABEL} (${cssPath}): ${error.message}`);
  }

  const rules = topLevelRules(stripComments(css));
  const light = new Map();
  const dark = new Map();
  let sawLight = false;
  let sawDark = false;

  for (const rule of rules) {
    const selectors = rule.selector.split(',').map((s) => s.trim());
    if (selectors.includes(':root')) {
      sawLight = true;
      for (const [key, value] of customProperties(rule.body)) light.set(key, value);
    }
    if (selectors.some((s) => s === '.dark' || s === ':root.dark' || s === 'html.dark')) {
      sawDark = true;
      for (const [key, value] of customProperties(rule.body)) dark.set(key, value);
    }
  }

  if (!sawLight) throw new FatalError(`no top-level \`:root { ... }\` rule found in ${CSS_LABEL}`);
  if (!sawDark) throw new FatalError(`no top-level \`.dark { ... }\` rule found in ${CSS_LABEL}`);
  if (light.size === 0) {
    throw new FatalError(`the \`:root\` rule in ${CSS_LABEL} declares no custom properties`);
  }

  return { light, dark };
}

/* ------------------------------------------------------------------ */
/* Colour values                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * #rgb, #rgba, #rrggbb, #rrggbbaa to RGBA (channels 0-255, alpha 0-1).
 * @param {string} value
 * @returns {{r: number, g: number, b: number, a: number} | null}
 */
function parseHex(value) {
  const match = /^#([0-9a-f]+)$/i.exec(String(value).trim());
  if (!match) return null;
  const hex = match[1];
  const byte = (s) => Number.parseInt(s, 16);
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: byte(hex[0] + hex[0]),
      g: byte(hex[1] + hex[1]),
      b: byte(hex[2] + hex[2]),
      a: hex.length === 4 ? byte(hex[3] + hex[3]) / 255 : 1,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: byte(hex.slice(0, 2)),
      g: byte(hex.slice(2, 4)),
      b: byte(hex.slice(4, 6)),
      a: hex.length === 8 ? byte(hex.slice(6, 8)) / 255 : 1,
    };
  }
  return null;
}

/**
 * rgb()/rgba(), legacy comma syntax and modern space syntax with an
 * optional `/ alpha`. Percentages accepted on channels and on alpha.
 * @param {string} value
 * @returns {{r: number, g: number, b: number, a: number} | null}
 */
function parseRgb(value) {
  const match = /^rgba?\(([^()]*)\)$/i.exec(String(value).trim());
  if (!match) return null;

  const parts = match[1].replace(/\//g, ' / ').split(/\s*,\s*|\s+/).filter(Boolean);
  const slash = parts.indexOf('/');
  const channels = slash >= 0 ? parts.slice(0, slash) : parts.slice(0, 3);
  const alphaToken = slash >= 0 ? parts[slash + 1] : parts[3];
  if (channels.length !== 3) return null;
  if (slash >= 0 && parts.length !== slash + 2) return null;
  if (slash < 0 && parts.length > 4) return null;

  const channel = (token) => {
    const n = Number.parseFloat(token);
    if (!Number.isFinite(n)) return null;
    return clamp(/%\s*$/.test(token) ? (n * 255) / 100 : n, 0, 255);
  };
  const rgb = channels.map(channel);
  if (rgb.some((n) => n === null)) return null;

  let alpha = 1;
  if (alphaToken !== undefined) {
    const n = Number.parseFloat(alphaToken);
    if (!Number.isFinite(n)) return null;
    alpha = clamp(/%\s*$/.test(alphaToken) ? n / 100 : n, 0, 1);
  }
  return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
}

/* ------------------------------------------------------------------ */
/* Token resolution (dark inherits from light, var() is followed)      */
/* ------------------------------------------------------------------ */

/**
 * Look a token up in a theme; the dark theme falls back to light, because
 * `.dark` only overrides: a token declared once in `:root` is still in
 * effect in dark mode.
 * @param {string} name
 * @param {'light'|'dark'} theme
 * @param {{light: Map<string,string>, dark: Map<string,string>}} tokens
 * @returns {{found: boolean, value: string|null, inherited: boolean}}
 */
function lookup(name, theme, tokens) {
  if (theme === 'dark' && tokens.dark.has(name)) {
    return { found: true, value: tokens.dark.get(name), inherited: false };
  }
  if (tokens.light.has(name)) {
    return { found: true, value: tokens.light.get(name), inherited: theme === 'dark' };
  }
  return { found: false, value: null, inherited: false };
}

/**
 * Shorten a css value for a one-line note.
 * @param {string} value
 * @returns {string}
 */
function shorten(value) {
  const flat = String(value).replace(/\s+/g, ' ').trim();
  return flat.length > 52 ? `${flat.slice(0, 49)}...` : flat;
}

/**
 * Resolve a raw css value to RGBA. Anything that is not a plain colour
 * (gradients, color-mix(), keywords) comes back as an error and is
 * SKIPPED by the caller - never silently treated as black.
 * @param {string} raw
 * @param {'light'|'dark'} theme
 * @param {{light: Map<string,string>, dark: Map<string,string>}} tokens
 * @param {Set<string>} seen var() names already visited (cycle guard)
 * @returns {{color?: {r:number,g:number,b:number,a:number}, error?: string}}
 */
function resolveValue(raw, theme, tokens, seen) {
  const value = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!value) return { error: 'empty value' };

  const hex = parseHex(value);
  if (hex) return { color: hex };
  const rgb = parseRgb(value);
  if (rgb) return { color: rgb };

  const reference = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]+))?\)$/.exec(value);
  if (reference) {
    const ref = reference[1];
    const fallback = reference[2] ? reference[2].trim() : null;
    if (seen.has(ref)) return { error: `var() reference cycle at ${ref}` };
    const next = new Set(seen).add(ref);
    const target = lookup(ref, theme, tokens);
    if (target.found) {
      const resolved = resolveValue(target.value, theme, tokens, next);
      if (resolved.color) return resolved;
      if (fallback) return resolveValue(fallback, theme, tokens, next);
      return resolved;
    }
    if (fallback) return resolveValue(fallback, theme, tokens, next);
    return { error: `var(${ref}) is not declared in the ${theme} theme` };
  }

  return { error: `not a plain colour: ${shorten(value)}` };
}

/**
 * Resolve a token name, or a literal colour such as `#ffffff`.
 * @param {string} name
 * @param {'light'|'dark'} theme
 * @param {{light: Map<string,string>, dark: Map<string,string>}} tokens
 * @returns {{ok: true, color: object, literal: boolean, inherited: boolean}
 *          | {ok: false, status: 'missing'|'unresolved', reason: string, value: string|null}}
 */
function resolveToken(name, theme, tokens) {
  if (!name.startsWith('--')) {
    const literal = resolveValue(name, theme, tokens, new Set());
    if (literal.color) return { ok: true, color: literal.color, literal: true, inherited: false };
    return { ok: false, status: 'unresolved', reason: literal.error, value: name };
  }
  const entry = lookup(name, theme, tokens);
  if (!entry.found) {
    return { ok: false, status: 'missing', reason: `not declared in the ${theme} theme`, value: null };
  }
  const resolved = resolveValue(entry.value, theme, tokens, new Set([name]));
  if (resolved.color) {
    return { ok: true, color: resolved.color, literal: false, inherited: entry.inherited };
  }
  return { ok: false, status: 'unresolved', reason: resolved.error, value: entry.value };
}

/* ------------------------------------------------------------------ */
/* Compositing + WCAG 2.2 maths                                        */
/* ------------------------------------------------------------------ */

/**
 * Standard source-over compositing in sRGB. The result is opaque.
 * @param {{r:number,g:number,b:number,a:number}} fg
 * @param {{r:number,g:number,b:number,a:number}} bg opaque backdrop
 * @returns {{r:number,g:number,b:number,a:number}}
 */
function compositeOver(fg, bg) {
  if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  const alpha = clamp(fg.a, 0, 1);
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    a: 1,
  };
}

/**
 * WCAG 2.2 channel linearisation.
 * @param {number} channel8 0-255
 * @returns {number}
 */
function linearise(channel8) {
  const c = channel8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.2 relative luminance.
 * @param {{r:number,g:number,b:number}} color
 * @returns {number}
 */
function relativeLuminance(color) {
  return 0.2126 * linearise(color.r) + 0.7152 * linearise(color.g) + 0.0722 * linearise(color.b);
}

/**
 * WCAG 2.2 contrast ratio, unrounded (display rounds, comparisons do not).
 * Reference values this must reproduce, see --selftest:
 * #757575 on #FFFFFF = 4.61, #FFFFFF on #B71920 = 6.62,
 * #0A0A0A on #FFFFFF = 19.80, and #0A0A0A on #B71920 = 2.99 (the reason
 * the plan forbids black text on red).
 * @param {{r:number,g:number,b:number}} a
 * @param {{r:number,g:number,b:number}} b
 * @returns {number}
 */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * #rrggbb for display, with the alpha appended when there is one.
 * @param {{r:number,g:number,b:number,a:number}} color
 * @returns {string}
 */
function toHex(color) {
  const part = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  const base = `#${part(color.r)}${part(color.g)}${part(color.b)}`;
  return color.a >= 1 ? base : `${base}/${color.a.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

/**
 * Backgrounds are assumed opaque. A translucent background token is
 * composited over white (light theme) or over the theme's `--bg` - black
 * if that is itself translucent or unavailable (dark theme) - and a note
 * says so, because that backdrop is an assumption, not a measurement.
 * @param {{r:number,g:number,b:number,a:number}} color
 * @param {'light'|'dark'} theme
 * @param {string} tokenName
 * @param {{light: Map<string,string>, dark: Map<string,string>}} tokens
 * @param {string[]} notes collected, de-duplicated, printed in the summary
 * @returns {{color: object, note: string|null}}
 */
function opaqueBackground(color, theme, tokenName, tokens, notes) {
  if (color.a >= 1) return { color, note: null };

  let base = WHITE;
  let baseLabel = '#ffffff';
  if (theme === 'dark') {
    base = BLACK;
    baseLabel = '#000000';
    if (tokenName !== '--bg') {
      const pageBg = resolveToken('--bg', theme, tokens);
      if (pageBg.ok && pageBg.color.a >= 1) {
        base = pageBg.color;
        baseLabel = `--bg ${toHex(pageBg.color)}`;
      }
    }
  }
  const note =
    `background ${tokenName} (${theme}) has alpha ${color.a.toFixed(2)}; ` +
    `composited over ${baseLabel} before measuring`;
  if (notes && !notes.includes(note)) notes.push(note);
  return { color: compositeOver(color, base), note };
}

/**
 * Build every result row: text on backgrounds per theme, then the fills.
 * @param {{light: Map<string,string>, dark: Map<string,string>}} tokens
 * @param {number} min threshold, 4.5 unless --min says otherwise
 */
function audit(tokens, min) {
  const results = [];
  const missing = [];
  const unresolved = [];
  const notes = [];

  const noteMissing = (theme, token, reason) => {
    if (!missing.some((m) => m.theme === theme && m.token === token)) {
      missing.push({ theme, token, reason });
    }
  };
  const noteUnresolved = (theme, token, value, reason) => {
    if (!unresolved.some((u) => u.theme === theme && u.token === token)) {
      unresolved.push({ theme, token, value, reason });
    }
  };

  /** Measure one foreground against one already-opaque background. */
  const measure = (theme, section, fgName, fgColor, bgName, bgColor, note) => {
    const flattened = compositeOver(fgColor, bgColor);
    const ratio = contrastRatio(flattened, bgColor);
    const alphaNote =
      fgColor.a < 1
        ? `foreground ${fgName} has alpha ${fgColor.a.toFixed(2)}; composited over ${bgName}`
        : null;
    results.push({
      theme,
      section,
      foreground: fgName,
      background: bgName,
      foregroundColor: toHex(fgColor),
      backgroundColor: toHex(bgColor),
      effectiveForeground: toHex(flattened),
      ratio: Number(ratio.toFixed(2)),
      exactRatio: ratio,
      aa: ratio >= min,
      aaa: ratio >= AAA,
      status: 'checked',
      note: [note, alphaNote].filter(Boolean).join('; ') || null,
    });
  };

  /** A row that could not be measured: reported, never counted as a failure. */
  const skip = (theme, section, fgName, bgName, status, reason) => {
    results.push({
      theme,
      section,
      foreground: fgName,
      background: bgName,
      foregroundColor: null,
      backgroundColor: null,
      effectiveForeground: null,
      ratio: null,
      exactRatio: null,
      aa: null,
      aaa: null,
      status,
      note: reason,
    });
  };

  for (const theme of THEMES) {
    /* Resolve the surfaces once per theme. */
    const backgrounds = [];
    for (const name of BACKGROUNDS) {
      const resolved = resolveToken(name, theme, tokens);
      if (!resolved.ok) {
        if (resolved.status === 'missing') noteMissing(theme, name, resolved.reason);
        else noteUnresolved(theme, name, resolved.value, resolved.reason);
        backgrounds.push({ name, ok: false, status: resolved.status, reason: resolved.reason });
        continue;
      }
      const flat = opaqueBackground(resolved.color, theme, name, tokens, notes);
      backgrounds.push({ name, ok: true, color: flat.color, note: flat.note });
    }

    const textTokens = [
      ...TEXT_TOKENS[theme],
      ...OPTIONAL_TEXT_TOKENS.filter((token) => lookup(token, theme, tokens).found),
    ];

    for (const name of textTokens) {
      const resolved = resolveToken(name, theme, tokens);
      if (!resolved.ok) {
        if (resolved.status === 'missing') noteMissing(theme, name, resolved.reason);
        else noteUnresolved(theme, name, resolved.value, resolved.reason);
        skip(theme, 'text', name, '(not measurable)', resolved.status, resolved.reason);
        continue;
      }
      for (const background of backgrounds) {
        if (!background.ok) {
          skip(
            theme,
            'text',
            name,
            background.name,
            background.status,
            `background ${background.name}: ${background.reason}`,
          );
          continue;
        }
        measure(theme, 'text', name, resolved.color, background.name, background.color, background.note);
      }
    }

    /* Fills: a CTA label is text, so the same threshold applies. */
    for (const pair of FILL_PAIRS) {
      const fg = resolveToken(pair.fg, theme, tokens);
      const bg = resolveToken(pair.bg, theme, tokens);
      if (!fg.ok || !bg.ok) {
        /* Absent tokens (--red / --red-hover before the Sprint 0 rebuild)
           get no row here, but they are still NAMED in the missing summary:
           the text section only covers light --red and dark --red-signal, so
           --red-hover (and dark --red) would otherwise vanish silently.
           Values that exist but are unresolvable are surfaced as rows. */
        for (const [name, resolved] of [[pair.fg, fg], [pair.bg, bg]]) {
          if (resolved.ok) continue;
          if (resolved.status === 'missing') {
            noteMissing(theme, name, resolved.reason);
            continue;
          }
          noteUnresolved(theme, name, resolved.value, resolved.reason);
          skip(theme, 'fill', pair.fg, pair.bg, 'unresolved', `${name}: ${resolved.reason}`);
        }
        continue;
      }
      const flat = opaqueBackground(bg.color, theme, pair.bg, tokens, notes);
      measure(theme, 'fill', pair.fg, fg.color, pair.bg, flat.color, flat.note);
    }
  }

  const checked = results.filter((row) => row.status === 'checked');
  const failed = checked.filter((row) => !row.aa);

  return {
    results,
    checked,
    failed,
    missing,
    unresolved,
    notes,
    totals: {
      checked: checked.length,
      passed: checked.length - failed.length,
      failed: failed.length,
      skipped: results.length - checked.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const ESC = String.fromCharCode(27);

/**
 * @param {boolean} enabled
 * @returns {Record<'green'|'red'|'dim'|'bold'|'yellow', (s: string) => string>}
 */
function makePainter(enabled) {
  const wrap = (code) => (s) => (enabled ? `${ESC}[${code}m${s}${ESC}[0m` : s);
  return { green: wrap(32), red: wrap(31), dim: wrap(2), bold: wrap(1), yellow: wrap(33) };
}

/**
 * @param {string} text
 * @param {number} width
 * @param {boolean} alignRight
 * @returns {string}
 */
function pad(text, width, alignRight) {
  const gap = ' '.repeat(Math.max(0, width - text.length));
  return alignRight ? gap + text : text + gap;
}

/**
 * @param {boolean|null} value
 * @returns {'PASS'|'FAIL'|'--'}
 */
function statusCell(value) {
  if (value === null) return '--';
  return value ? 'PASS' : 'FAIL';
}

function paintStatus(cell, paint) {
  if (cell === 'PASS') return paint.green(cell);
  if (cell === 'FAIL') return paint.red(cell);
  return paint.dim(cell);
}

/**
 * Fixed-width table, plain ASCII, ANSI colour optional. Column widths are
 * computed across every section so the three tables line up with each other,
 * and colour is applied after padding so the codes never shift a column.
 * Columns: THEME | TEXT TOKEN | ON BACKGROUND | RATIO | AA n | AAA 7
 * @param {ReturnType<typeof audit>} report
 * @param {number} min
 * @param {ReturnType<typeof makePainter>} paint
 * @returns {string}
 */
function renderTable(report, min, paint) {
  const headers = [
    'THEME',
    'TEXT TOKEN',
    'ON BACKGROUND',
    'RATIO',
    `AA ${min.toFixed(2)}`,
    `AAA ${AAA.toFixed(2)}`,
  ];

  const rowOf = (row) => [
    row.theme,
    row.foreground,
    row.background,
    row.status === 'checked' ? `${row.ratio.toFixed(2)}:1` : '--',
    statusCell(row.aa),
    statusCell(row.aaa),
  ];

  const pick = (theme, section) =>
    report.results.filter((row) => row.theme === theme && row.section === section).map(rowOf);

  const sections = [
    { title: 'LIGHT THEME - text on backgrounds', rows: pick('light', 'text') },
    { title: 'DARK THEME - text on backgrounds', rows: pick('dark', 'text') },
    {
      title: 'FILLS - label on fill (a CTA label is text: same bar; never black text on red)',
      rows: report.results.filter((row) => row.section === 'fill').map(rowOf),
    },
  ];

  const allRows = sections.flatMap((section) => section.rows);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...allRows.map((row) => row[i].length), 0),
  );
  const alignRight = [false, false, false, true, false, false];

  const trimEnd = (s) => s.replace(/\s+$/, '');
  const headerLine = trimEnd(headers.map((header, i) => pad(header, widths[i], alignRight[i])).join('  '));
  const ruleLine = widths.map((width) => '-'.repeat(width)).join('  ');
  const bodyLine = (cells) =>
    trimEnd(
      cells
        .map((cell, i) => {
          if (i < 4) return pad(cell, widths[i], alignRight[i]);
          return paintStatus(cell, paint) + ' '.repeat(Math.max(0, widths[i] - cell.length));
        })
        .join('  '),
    );

  const out = [];
  out.push(
    paint.bold(`WCAG 2.2 contrast - ${CSS_LABEL} (threshold ${min.toFixed(2)}:1, AAA ${AAA.toFixed(2)}:1)`),
  );

  for (const section of sections) {
    out.push('');
    out.push(paint.bold(section.title));
    out.push(paint.dim(headerLine));
    out.push(paint.dim(ruleLine));
    if (section.rows.length === 0) {
      out.push(paint.dim('  (nothing to check)'));
      continue;
    }
    for (const row of section.rows) out.push(bodyLine(row));
  }

  const { totals } = report;
  out.push('');
  out.push(
    `Summary: ${totals.checked} pair(s) checked, ` +
      `${paint.green(`${totals.passed} pass`)}, ` +
      `${totals.failed > 0 ? paint.red(`${totals.failed} fail`) : '0 fail'}` +
      `${totals.skipped > 0 ? `, ${paint.dim(`${totals.skipped} not measurable`)}` : ''}.`,
  );

  if (report.failed.length > 0) {
    out.push(paint.red(`Failing pairs (below ${min.toFixed(2)}:1):`));
    for (const row of report.failed) {
      out.push(
        `  - ${row.theme} ${row.foreground} (${row.foregroundColor}) on ${row.background} ` +
          `(${row.backgroundColor}) = ${row.ratio.toFixed(2)}:1`,
      );
    }
  }

  out.push(
    report.missing.length > 0
      ? paint.yellow(
          `Missing expected token(s): ${report.missing.map((m) => `${m.theme} ${m.token}`).join(', ')}` +
            ` - see ${PLAN_REF} (--red / --red-signal arrive with the Sprint 0 token rebuild);` +
            ' missing tokens do not fail this check.',
        )
      : paint.dim(`Missing expected token(s): none - every token of ${PLAN_REF} is declared.`),
  );

  if (report.unresolved.length > 0) {
    out.push(paint.yellow('Unresolved values (skipped, never assumed black):'));
    for (const item of report.unresolved) {
      out.push(`  - ${item.theme} ${item.token}: ${item.reason}${item.value ? ` [${shorten(item.value)}]` : ''}`);
    }
  }

  if (report.notes.length > 0) {
    out.push(paint.dim('Notes:'));
    for (const note of report.notes) out.push(paint.dim(`  - ${note}`));
  }

  out.push('');
  out.push(totals.failed > 0 ? paint.red('RESULT: FAIL') : paint.green('RESULT: PASS'));
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* Self-test: guards the arithmetic against silent drift               */
/* ------------------------------------------------------------------ */

/**
 * @param {ReturnType<typeof makePainter>} paint
 * @returns {boolean} true when every reference ratio is reproduced
 */
function selfTest(paint) {
  const cases = [
    { fg: '#757575', bg: '#ffffff', expected: 4.61 },
    { fg: '#ffffff', bg: '#b71920', expected: 6.62 },
    { fg: '#0a0a0a', bg: '#ffffff', expected: 19.8 },
    { fg: '#0a0a0a', bg: '#b71920', expected: 2.99 },
    { fg: '#f0383f', bg: '#080808', expected: 5.1 },
  ];
  let ok = true;
  const lines = [paint.bold('Self-test - known WCAG 2.2 reference ratios')];
  for (const testCase of cases) {
    const ratio = contrastRatio(parseHex(testCase.fg), parseHex(testCase.bg));
    const pass = Math.abs(ratio - testCase.expected) <= 0.05;
    ok = ok && pass;
    lines.push(
      `  ${pass ? paint.green('PASS') : paint.red('FAIL')} ${testCase.fg} on ${testCase.bg}` +
        ` = ${ratio.toFixed(2)}:1 (expected ~${testCase.expected})`,
    );
  }
  console.log(lines.join('\n'));
  return ok;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const HELP = `check-contrast - WCAG 2.2 contrast audit of the Diab Car design tokens.

  node scripts/check-contrast.mjs [options]

  --json         print the machine-readable result instead of the table
  --min=<n>      override the ${AA.toFixed(1)}:1 threshold (1 < n <= 21)
  --no-color     disable ANSI colour (NO_COLOR and a non-TTY stdout do too)
  --color        force ANSI colour on
  --selftest     verify the contrast maths against known reference ratios
  -h, --help     this message

Exit codes: 0 all pairs pass, 1 a pair is below the threshold, 2 parse/usage error.
Pairs, thresholds and the red-token rules come from ${PLAN_REF}.`;

/**
 * @param {string[]} argv
 * @returns {{json: boolean, min: number, color: boolean|null, help: boolean, selftest: boolean}}
 */
function parseArgs(argv) {
  const opts = { json: false, min: AA, color: null, help: false, selftest: false };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--no-color') opts.color = false;
    else if (arg === '--color') opts.color = true;
    else if (arg === '--selftest') opts.selftest = true;
    else if (arg.startsWith('--min=')) {
      const raw = arg.slice('--min='.length);
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n) || n <= 1 || n > 21) {
        throw new FatalError(`--min must be a number greater than 1 and at most 21 (got "${raw}")`);
      }
      opts.min = n;
    } else {
      throw new FatalError(`unknown argument "${arg}" (try --help)`);
    }
  }
  return opts;
}

/**
 * @returns {number} the process exit code
 */
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const colorEnabled =
    opts.color === null ? !process.env.NO_COLOR && Boolean(process.stdout.isTTY) : opts.color;
  const paint = makePainter(colorEnabled && !opts.json);

  if (opts.help) {
    console.log(HELP);
    return 0;
  }
  if (opts.selftest) {
    return selfTest(paint) ? 0 : 1;
  }

  const tokens = readTokens(CSS_PATH);
  const report = audit(tokens, opts.min);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: report.totals.failed === 0,
          css: CSS_LABEL,
          plan: PLAN_REF,
          threshold: opts.min,
          aaaThreshold: AAA,
          totals: report.totals,
          results: report.results.map((row) => {
            /* exactRatio is the unrounded comparison value; the JSON
               exposes the rounded `ratio` only. */
            const copy = { ...row };
            delete copy.exactRatio;
            return copy;
          }),
          failures: report.failed.map((row) => ({
            theme: row.theme,
            section: row.section,
            foreground: row.foreground,
            background: row.background,
            ratio: row.ratio,
          })),
          missing: report.missing,
          unresolved: report.unresolved,
          notes: report.notes,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(renderTable(report, opts.min, paint));
  }

  return report.totals.failed > 0 ? 1 : 0;
}

/* Never throw: a parse or usage failure exits 2 with a clear message. */
try {
  process.exitCode = main();
} catch (error) {
  const detail =
    error instanceof FatalError
      ? error.message
      : `unexpected failure: ${error && error.stack ? error.stack : String(error)}`;
  console.error(`check-contrast: ${detail}`);
  process.exitCode = 2;
}
