// lib/aoy-taxonomy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Campaign Asia-Pacific Agency of the Year (AOY) — controlled, market-scoped
// category taxonomy for the AOY entry picker (Phase 1, Session 72).
//
// WHY THIS EXISTS
// AOY is an agency-performance show whose categories are track-prefixed and share
// first words, so the legacy first-word ILIKE show_profiles lookup mis-selects.
// evaluate-entry (S71) instead does an EXACT-key lookup: it normalizes
// directions.best_category to a track-agnostic rubric stem and matches
// show_profiles.category_pattern, falling back to the show-level NULL row.
// For that lookup to fire, best_category must be a canonical, prefix-strippable
// value. This module is what the picker uses to PRODUCE that value, and the
// controlled per-market lists the picker offers (spec §3.1/§3.3).
//
// PARITY CONTRACT (do not break)
// normalizeAoyCategory() and AOY_MARKET_PREFIXES below MUST stay byte-for-byte
// equivalent to the copies inlined in edge-functions/evaluate-entry.ts and
// edge-functions/detect-entry-context.ts (Deno edge functions are standalone and
// cannot import this module). The node parity test
// (migrations/../scripts) asserts every value this module emits normalizes onto
// exactly one of AOY_CATEGORY_KEYS. If you edit the prefix list or the normalizer,
// edit all three and re-run the parity test.
//
// SOURCE OF TRUTH
// Per-track lists pulled from the live aoyawards.com sub-region pages 26 Jun 2026
// (VERIFIED RESEARCH/AOY-2026-Per-Track-Categories-VERIFIED-2026-06-26.md).
// Rubric stem keys: migrations/aoy-show-profiles-2026.sql (63 stems + 1 NULL).
// South Asia is EXCLUDED (still on its 2025 cycle as of 26 Jun 2026).
// Asia-Pacific (Network) is EXCLUDED from the picker (aggregate/network titles
// awarded by the point system, not entered; its 11 rubric rows remain in the DB).
// ─────────────────────────────────────────────────────────────────────────────

export const AOY_SHOW_NAME = 'Campaign Asia Agency of the Year'

// Tolerant of 'Campaign Asia' vs 'Campaign Asia-Pacific' naming variants.
// Mirror of evaluate-entry.ts isAoyShow().
export function isAoyShow(showName: string | null | undefined): boolean {
  const s = (showName ?? '').trim().toLowerCase()
  return s.includes('campaign asia') && s.includes('agency of the year')
}

// Market + sub-region prefixes stripped to reach the rubric stem. 'Asia-Pacific'
// is deliberately NOT here: APAC rows keep that prefix so they never collide with
// the market/regional rubric. Longest-first; matching is anchored startsWith so a
// short token can never strip a longer prefix it sits inside. VERIFIED against the
// live site naming 26 Jun 2026 (e.g. 'Australia/New Zealand', 'Cambodia, Laos,
// Myanmar'); legacy hyphen/abbreviated forms kept as tolerant aliases.
export const AOY_MARKET_PREFIXES: string[] = [
  'Cambodia, Laos, Myanmar', 'Cambodia-Laos-Myanmar',
  'Australia/New Zealand',
  'Rest of South Asia', 'Hong Kong SAR',
  'Greater China', 'Southeast Asia', 'South Asia', 'Japan/Korea', 'Australia/NZ',
  'New Zealand', 'Hong Kong', 'Philippines', 'Indonesia', 'Singapore',
  'Australia', 'Pakistan', 'Malaysia', 'Thailand', 'Vietnam', 'Taiwan',
  'China', 'India', 'Japan', 'Korea',
]

// 'Greater China Performance Agency of the Year' -> 'Performance Agency of the Year';
// 'Asia-Pacific Performance Agency of the Year' -> unchanged; strips a trailing [NEW].
// Mirror of evaluate-entry.ts normalizeAoyCategory().
export function normalizeAoyCategory(raw: string | null | undefined): string {
  let s = (raw ?? '').replace(/\[NEW\]/gi, '').replace(/\s+/g, ' ').trim()
  for (const p of AOY_MARKET_PREFIXES) {
    if (s.toLowerCase().startsWith(p.toLowerCase() + ' ')) {
      s = s.slice(p.length + 1).trim()
      break
    }
  }
  return s
}

// ─── Tiers / pillars ─────────────────────────────────────────────────────────
export type AoyPillar = 'agency' | 'people' | 'brand'
export type AoyTier = 'market' | 'regional'

export const AOY_PILLARS: { id: AoyPillar; label: string }[] = [
  { id: 'agency', label: 'Agency' },
  { id: 'people', label: 'People' },
  { id: 'brand', label: 'Brand' },
]

// ─── Rubric stem keys (the 63 in show_profiles; 1 show-level NULL excluded) ────
// Used by the parity test. Exact-match targets for normalizeAoyCategory output.
export const AOY_CATEGORY_KEYS: string[] = [
  'AD Campaign of the Year', 'AI AD Campaign of the Year', 'AI Person/Team of the Year',
  'Account Person of the Year', 'Asia-Pacific Account Person of the Year',
  'Agency AI Excellence of the Year', 'Agency Growth Leader of the Year',
  'Asia-Pacific Agency Growth Leader of the Year', 'Agency Head of the Year',
  'Asia-Pacific Agency Head of the Year', 'Agency Marketer Partnership of the Year',
  'B2B Marketing Agency of the Year', 'B2C Marketing Agency of the Year',
  'Best Culture', 'Asia-Pacific Best Culture (Network)', 'Best Place to Work',
  'Asia-Pacific Best Place to Work (Network)', 'Boutique Agency of the Year',
  'Brand Design Agency of the Year', 'Brand Experience Agency of the Year',
  'Brand of the Year', 'CSR Achievement of the Year',
  'Channel/Engagement Planner of the Year', 'Consultancy of the Year',
  'Content Marketing Agency of the Year', 'Corporate Communications/Marketing Team of the Year',
  'Creative Agency of the Year', 'Creative Leader of the Year',
  'Asia-Pacific Creative Leader of the Year', 'Customer Engagement Agency of the Year',
  'Data Analytics Agency of the Year', 'Digital Innovation Agency of the Year',
  'E-Commerce Agency of the Year', 'Event Marketing Agency of the Year',
  'Independent Agency of the Year', 'Independent Agency of the Year (SEA Markets only)',
  'Influencer Marketing Agency of the Year', 'Integrated Marketing Agency of the Year',
  'MarTech Agency of the Year', 'Market Research Agency of the Year',
  'Marketer of the Year', 'Media Agency of the Year',
  'Most Innovative MarTech Team of the Year', 'New Business Development Person/Team of the Year',
  'OOH Agency of the Year', 'PR Agency of the Year', 'Performance Agency of the Year',
  'Asia-Pacific Performance Agency of the Year', 'Producer of the Year',
  'Production Company of the Year', 'Programmatic Agency of the Year',
  'Asia-Pacific Programmatic Agency of the Year', 'Programmatic Person of the Year',
  'Asia-Pacific Programmatic Person of the Year', 'Social Media Agency of the Year',
  'Specialist Agency of the Year', 'Strategic/Brand Planner of the Year',
  'Talent Development Programme of the Year', 'Asia-Pacific Talent Development Programme of the Year',
  'Asia-Pacific Tech Agency of the Year', 'Young Achiever of the Year',
  'Young Business Leader of the Year', 'Young Creative Person of the Year',
]

// ─── Shared stem sets ──────────────────────────────────────────────────────────
const MARKET_DISCIPLINES_BASE = [
  'Creative Agency of the Year',
  'Digital Innovation Agency of the Year',
  'Media Agency of the Year',
  'PR Agency of the Year',
]

const REGIONAL_AGENCY_FULL = [
  'Agency AI Excellence of the Year', 'Agency Marketer Partnership of the Year',
  'B2B Marketing Agency of the Year', 'B2C Marketing Agency of the Year',
  'Best Culture', 'Best Place to Work', 'Boutique Agency of the Year',
  'Brand Design Agency of the Year', 'Brand Experience Agency of the Year',
  'Consultancy of the Year', 'Content Marketing Agency of the Year',
  'CSR Achievement of the Year', 'Customer Engagement Agency of the Year',
  'Data Analytics Agency of the Year', 'E-Commerce Agency of the Year',
  'Event Marketing Agency of the Year', 'Influencer Marketing Agency of the Year',
  'Integrated Marketing Agency of the Year', 'Market Research Agency of the Year',
  'MarTech Agency of the Year', 'OOH Agency of the Year',
  'Performance Agency of the Year', 'Production Company of the Year',
  'Programmatic Agency of the Year', 'Social Media Agency of the Year',
  'Specialist Agency of the Year', 'Talent Development Programme of the Year',
  'Independent Agency of the Year',
]

// SEA runs Independent at MARKET tier, so it is absent from SEA's regional list.
const REGIONAL_AGENCY_SEA = REGIONAL_AGENCY_FULL.filter(s => s !== 'Independent Agency of the Year')

const PEOPLE_STEMS = [
  'Account Person of the Year', 'Agency Growth Leader of the Year',
  'Agency Head of the Year', 'AI Person/Team of the Year',
  'Channel/Engagement Planner of the Year', 'Corporate Communications/Marketing Team of the Year',
  'Creative Leader of the Year', 'Most Innovative MarTech Team of the Year',
  'New Business Development Person/Team of the Year', 'Producer of the Year',
  'Strategic/Brand Planner of the Year', 'Young Achiever of the Year',
  'Young Business Leader of the Year', 'Young Creative Person of the Year',
]

const BRAND_STEMS = [
  'AD Campaign of the Year', 'AI AD Campaign of the Year',
  'Brand of the Year', 'Marketer of the Year',
]

// Stems added for 2026 (display a [NEW] chip).
export const AOY_NEW_STEMS = new Set([
  'Agency AI Excellence of the Year',
  'MarTech Agency of the Year',
  'Most Innovative MarTech Team of the Year',
])

// ─── Tracks ────────────────────────────────────────────────────────────────────
export type AoyMarket = { label: string; prefix: string }
export type AoyTrack = {
  id: string
  label: string
  subregionPrefix: string
  ceremonyNote: string
  markets: AoyMarket[]
  marketDisciplines: string[]        // Agency stems offered at market tier
  regional: { agency: string[]; people: string[]; brand: string[] }
}

export const AOY_TRACKS: AoyTrack[] = [
  {
    id: 'greater-china',
    label: 'Greater China',
    subregionPrefix: 'Greater China',
    ceremonyNote: '1 Dec 2026, Shanghai',
    markets: [
      { label: 'China', prefix: 'China' },
      { label: 'Hong Kong SAR', prefix: 'Hong Kong SAR' },
      { label: 'Taiwan', prefix: 'Taiwan' },
    ],
    marketDisciplines: MARKET_DISCIPLINES_BASE,
    regional: { agency: REGIONAL_AGENCY_FULL, people: PEOPLE_STEMS, brand: BRAND_STEMS },
  },
  {
    id: 'australia-new-zealand',
    label: 'Australia/New Zealand',
    subregionPrefix: 'Australia/New Zealand',
    ceremonyNote: 'Late Nov–early Dec 2026',
    markets: [
      { label: 'Australia', prefix: 'Australia' },
      { label: 'New Zealand', prefix: 'New Zealand' },
    ],
    marketDisciplines: MARKET_DISCIPLINES_BASE,
    regional: { agency: REGIONAL_AGENCY_FULL, people: PEOPLE_STEMS, brand: BRAND_STEMS },
  },
  {
    id: 'japan-korea',
    label: 'Japan/Korea',
    subregionPrefix: 'Japan/Korea',
    ceremonyNote: '25 Nov 2026, Hilton Tokyo',
    markets: [
      { label: 'Japan', prefix: 'Japan' },
      { label: 'Korea', prefix: 'Korea' },
    ],
    marketDisciplines: MARKET_DISCIPLINES_BASE,
    regional: { agency: REGIONAL_AGENCY_FULL, people: PEOPLE_STEMS, brand: BRAND_STEMS },
  },
  {
    id: 'southeast-asia',
    label: 'Southeast Asia',
    subregionPrefix: 'Southeast Asia',
    ceremonyNote: '8 Dec 2026, Fairmont Singapore',
    markets: [
      { label: 'Cambodia, Laos, Myanmar', prefix: 'Cambodia, Laos, Myanmar' },
      { label: 'Indonesia', prefix: 'Indonesia' },
      { label: 'Malaysia', prefix: 'Malaysia' },
      { label: 'Philippines', prefix: 'Philippines' },
      { label: 'Singapore', prefix: 'Singapore' },
      { label: 'Thailand', prefix: 'Thailand' },
      { label: 'Vietnam', prefix: 'Vietnam' },
    ],
    // SEA adds Independent at market tier.
    marketDisciplines: [...MARKET_DISCIPLINES_BASE, 'Independent Agency of the Year'],
    regional: { agency: REGIONAL_AGENCY_SEA, people: PEOPLE_STEMS, brand: BRAND_STEMS },
  },
]

export function aoyTrackById(id: string): AoyTrack | undefined {
  return AOY_TRACKS.find(t => t.id === id)
}

// ─── Picker option model ─────────────────────────────────────────────────────
// One selectable category within a (track, pillar). Market-tier options require a
// market choice (requiresMarket=true); regional options resolve directly.
export type AoyCategoryOption = {
  stemKey: string          // the rubric key normalizeAoyCategory() must produce
  label: string            // what the user sees in the dropdown
  tier: AoyTier
  requiresMarket: boolean
  isNew: boolean
}

// Two stems whose live-site label appends "of the Year"; the rubric key does not.
const STEM_DISPLAY_OVERRIDE: Record<string, string> = {
  'Best Culture': 'Best Culture',
  'Best Place to Work': 'Best Place to Work',
}

function toOption(stemKey: string, tier: AoyTier): AoyCategoryOption {
  return {
    stemKey,
    label: STEM_DISPLAY_OVERRIDE[stemKey] ?? stemKey,
    tier,
    requiresMarket: tier === 'market',
    isNew: AOY_NEW_STEMS.has(stemKey),
  }
}

// All selectable categories for a (track, pillar). Agency has market-tier +
// regional-tier; People and Brand are regional-tier only.
export function aoyCategoryOptions(trackId: string, pillar: AoyPillar): AoyCategoryOption[] {
  const track = aoyTrackById(trackId)
  if (!track) return []
  if (pillar === 'agency') {
    const market = track.marketDisciplines.map(s => toOption(s, 'market'))
    const regional = track.regional.agency.map(s => toOption(s, 'regional'))
    return [...market, ...regional]
  }
  return track.regional[pillar].map(s => toOption(s, 'regional'))
}

// ─── Canonical best_category construction ────────────────────────────────────
// Market tier -> "<market> <stem>"; regional tier -> "<subregion> <stem>".
// The result is what gets stored on directions.best_category and is guaranteed
// (by the parity test) to normalize back to `stemKey`.
export function buildAoyBestCategory(args: {
  trackId: string
  option: AoyCategoryOption
  marketPrefix?: string | null
}): string | null {
  const track = aoyTrackById(args.trackId)
  if (!track) return null
  const { option, marketPrefix } = args
  if (option.requiresMarket) {
    const m = track.markets.find(mk => mk.prefix === marketPrefix)
    if (!m) return null
    return `${m.prefix} ${option.stemKey}`
  }
  return `${track.subregionPrefix} ${option.stemKey}`
}

// Human label for a stored value (used in the direction card / confirmation copy).
export function aoyDisplayLabel(args: {
  trackId: string
  option: AoyCategoryOption
  marketLabel?: string | null
}): string {
  const track = aoyTrackById(args.trackId)
  const scope = args.option.requiresMarket
    ? (args.marketLabel ?? '')
    : (track?.label ?? '')
  return `${scope} ${args.option.label}`.trim()
}
