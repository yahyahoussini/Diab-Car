/** Namespaces needed by client components — keeps the client bundle small. */
export const CLIENT_NAMESPACES = ['common', 'nav', 'widget', 'locations', 'booking', 'fleet', 'vehicle', 'cookie', 'contact', 'longTerm', 'chauffeur'];

export function pickMessages(messages, namespaces = CLIENT_NAMESPACES) {
  const out = {};
  for (const ns of namespaces) if (messages?.[ns]) out[ns] = messages[ns];
  return out;
}
