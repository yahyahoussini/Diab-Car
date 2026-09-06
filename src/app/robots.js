import { SITE_URL } from '@/lib/seo';

/**
 * Open to search engines AND AI answer engines (we want citations).
 * Admin, API and filtered/paginated fleet URLs are excluded.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/*?*sort=', '/*?*maxPrice=', '/*?*from='],
      },
      {
        userAgent: ['Googlebot', 'bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User', 'ClaudeBot', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'meta-externalagent', 'Meta-WebIndexer', 'Amazonbot', 'DuckAssistBot'],
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
