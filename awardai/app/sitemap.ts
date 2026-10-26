// app/sitemap.ts: served at /sitemap.xml (SEO pass, 21 Oct 2026; it was a 404).
// Every public, indexable page, with articles read live from the articles table
// so a newly published article enters the sitemap within the hour without a
// redeploy. Submit https://www.gotshortlisted.com/sitemap.xml in Search Console.
import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 3600

const SITE = 'https://www.gotshortlisted.com'

async function getArticles(): Promise<{ slug: string; published_at: string; updated_at: string | null }[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data, error } = await supabase
      .from('articles')
      .select('slug, published_at, updated_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
    if (error || !data) return []
    return data
  } catch {
    // A failed read must not take the whole sitemap down: the static pages
    // below still list, and the next revalidation picks the articles up.
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getArticles()
  const newestArticle = articles[0]?.published_at

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/shows`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE}/articles`, ...(newestArticle && { lastModified: newestArticle }), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/faq`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/indie`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/tno-report`, lastModified: '2026-07-30', changeFrequency: 'yearly', priority: 0.7 },
    { url: `${SITE}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  const articlePages: MetadataRoute.Sitemap = articles.map(a => ({
    url: `${SITE}/articles/${a.slug}`,
    lastModified: a.updated_at || a.published_at,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticPages, ...articlePages]
}
