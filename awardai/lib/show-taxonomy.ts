// lib/show-taxonomy.ts
//
// Canonical show list + per-show category taxonomy + the no-category helpers,
// extracted from app/projects/[id]/page.tsx (S158 polish) so the trial first-run
// route (/start) selects shows and categories through the EXACT same data and
// helpers as the main workflow — no drift. app/projects/[id]/page.tsx imports
// these back; it no longer defines them inline. First step of the planned
// projects/[id] structural refactor.
import { isAoyShow } from './aoy-taxonomy'
import { DEADLINES_2026, normaliseKbShow } from './shows-data'

// Canonical list of award shows — displayed in the Brief tab selector
// Derived from shows-data.ts — single source of truth for show names.
// To add or remove shows, update DEADLINES_2026 in lib/shows-data.ts.
export const CANONICAL_SHOWS = DEADLINES_2026.map(d => d.show).sort((a, b) => a.localeCompare(b))

// Comprehensive category lists per award show — used in Script tab dropdowns
// Session 52: tolerant category lookup. SHOW_CATEGORIES is keyed by exact
// canonical names, but show fields are free text and detection's keyword map
// historically emitted variants ('Effies', 'New York Festivals') that matched
// no key — the user saw an empty category dropdown and a dead end. ALWAYS use
// categoriesForShow() to read category lists; never index SHOW_CATEGORIES
// directly.
export const SHOW_CATEGORY_ALIASES: Record<string, string> = {
  'effies': 'Effie APAC',
  'effie': 'Effie APAC',
  'effies apac': 'Effie APAC',
  'effie awards': 'Effie APAC',
  'asia pacific effie awards': 'Effie APAC',
  'new york festivals': 'New York Festivals Advertising Awards',
  'nyf': 'New York Festivals Advertising Awards',
  'cannes': 'Cannes Lions',
  'spikes': 'Spikes Asia',
  'warc': 'WARC Awards',
  'one show': 'One Show',
  'mma smarties': 'MMA Smarties APAC',
  'smarties': 'MMA Smarties APAC',
  'smarties apac': 'MMA Smarties APAC',
  // SMARTIES uses one global category framework — Global reuses the APAC list
  'mma smarties global': 'MMA Smarties APAC',
  'smarties global': 'MMA Smarties APAC',
  'andy awards': 'ANDY Awards',
}

export const categoriesForShow = (showName: string): string[] => {
  const name = (showName || '').trim()
  if (!name) return []
  if (SHOW_CATEGORIES[name]) return SHOW_CATEGORIES[name]
  const lower = name.toLowerCase()
  const ciKey = Object.keys(SHOW_CATEGORIES).find(k => k.toLowerCase() === lower)
  if (ciKey) return SHOW_CATEGORIES[ciKey]
  const alias = SHOW_CATEGORY_ALIASES[lower]
  if (alias && SHOW_CATEGORIES[alias]) return SHOW_CATEGORIES[alias]
  return []
}

/* Placeholder for the free-text category input, built from the SHOW'S OWN
 * documented categories (5 Aug 2026 / rebuilt 6 Aug 2026). The previous copy
 * hardcoded 'Seasonal Marketing, Film Craft, Creative Effectiveness' for EVERY
 * show; two of those three do not exist for Effie APAC, so a working picklist
 * (20 real options bound on the live DOM) read as broken. Examples must come
 * from categoriesForShow so they can never contradict the datalist beneath the
 * input. Falls back to the honest optional prompt when the show has no
 * documented list -- never invent examples for an undocumented show. */
export const categoryPlaceholderForShow = (showName: string): string => {
  const cats = categoriesForShow(showName)
  if (cats.length === 0) return 'Type a category if you know it (optional)'
  let shown = cats.slice(0, 3)
  // Real category names run long (AOY stems, craft sub-disciplines). Drop to
  // two examples rather than overflow a narrow input on mobile.
  if (shown.join(', ').length > 48) shown = cats.slice(0, 2)
  return 'e.g. ' + shown.join(', ') + (cats.length > shown.length ? '\u2026' : '')
}

// Session 99 — shows with NO category concept at all, not just an undocumented
// list. Distinct from Clio Entertainment/Sports/Creators/ANDY/Gerety/ROI
// Festival (categoriesForShow() also returns [] for those, but real categories
// exist and are simply not yet in SHOW_CATEGORIES per the research pipeline —
// never conflate "not yet documented" with "does not exist"). Women to Watch
// judges ONE uniform nomination form per the verified entry kit (Show-Pilots-
// EntryForm-Research-2026-07-01.md §1): there is no category to pick, so the
// free-text input + "Suggest for me" (which 500s on an empty candidate list,
// S99 bug report) are both the wrong UI here, not just unpopulated.
export const NO_CATEGORY_SHOWS = ['Campaign Asia Women to Watch APAC']
export const showHasNoCategoryConcept = (showName: string): boolean =>
  NO_CATEGORY_SHOWS.some(s => s.toLowerCase() === (showName || '').trim().toLowerCase())
// The fixed value written to best_category for a no-category show. Any string
// is functionally safe (the config resolver's category-exact lookup always
// misses and falls back to the show-level entry_form row — the only row these
// shows have), so this is chosen for display only.
export const NO_CATEGORY_PLACEHOLDER = 'Nomination'

// A show whose category list is not yet seeded in SHOW_CATEGORIES (SABRE, Clio
// Entertainment/Sports/Creators, ANDY, Gerety, ROI Festival). Real categories
// exist (unlike showHasNoCategoryConcept); they are simply not documented yet, so
// categoriesForShow() returns []. For these, "Suggest for me" has zero candidates
// and 500s, and forcing a required category is a dead end, so category is optional
// and the suggest button is hidden until the taxonomy is seeded. Both gates key
// off categoriesForShow(), so seeding the list restores both (self-heal).
export const showHasNoCategoryList = (showName: string): boolean =>
  !isAoyShow(showName) &&
  !showHasNoCategoryConcept(showName) &&
  categoriesForShow(showName).length === 0

// Build 2 (Session 55): candidate list sent to evaluate-entry for the
// next_opportunities field (judge mode). Only shows with verified category
// lists qualify (SHOW_CATEGORIES keys) — the no-category-list shows are
// automatically excluded, and the show being evaluated is excluded here AND
// re-enforced server-side (Session 52 suggest-mode pattern). Old edge
// functions ignore the param; old frontends send nothing — deploy-order safe
// in both directions.
export const buildNextCandidates = (excludeShow: string): { show: string; categories: string[] }[] => {
  const ex = (excludeShow || '').trim().toLowerCase()
  return Object.keys(SHOW_CATEGORIES)
    .filter(s => s.toLowerCase() !== ex)
    .map(s => ({ show: s, categories: SHOW_CATEGORIES[s] }))
}

// Session 55 feedback round: direction show names are FREE TEXT from
// generate-directions (legacy rows especially carry variants like 'Effies' or
// 'Spikes'), while Next Step suggestions are canonical. Tolerant comparison:
// alias-normalise both sides, then case-insensitive equality. Never compare
// show names with === when one side comes from a direction row.
export const sameShow = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false
  const norm = (s: string) => (normaliseKbShow(s) ?? s).trim().toLowerCase()
  return norm(a) === norm(b)
}

// SMARTIES show detection. Byte-aligned with the copies in
// generate-smarties-draft.ts and evaluate-smarties-entry.ts: "smarties" is unique
// to MMA among canonical show names, so the substring is the reliable signal (the
// keyword map routes every variant to "MMA Smarties APAC" / "MMA Smarties Global").
export function isSmartiesShow(showName: string | null | undefined): boolean {
  return (showName ?? '').trim().toLowerCase().includes('smarties')
}

export const SHOW_CATEGORIES: Record<string, string[]> = {
  'Cannes Lions': [
    'Film Lions', 'Film Craft Lions', 'Titanium Lions', 'Grand Prix for Good',
    'Creative Business Transformation Lions', 'Creative Effectiveness Lions',
    'Creative Commerce Lions', 'Creative Data Lions', 'Creative Strategy Lions',
    'Creative X Lions', 'Digital Craft Lions', 'Direct Lions',
    'Entertainment Lions', 'Entertainment Lions for Gaming',
    'Entertainment Lions for Music', 'Entertainment Lions for Sport',
    'Health & Wellness Lions', 'Industry Craft Lions', 'Innovation Lions',
    'Luxury & Lifestyle Lions', 'Media Lions', 'Mobile Lions',
    'Outdoor Lions', 'PR Lions', 'Print & Publishing Lions',
    'Radio & Audio Lions', 'Social & Influencer Lions',
    'Sustainable Development Goals Lions',
  ],
  'D&AD': [
    'Film Advertising', 'Film Advertising Crafts', 'TV & Cinema Advertising',
    'TV & Cinema Crafts', 'Branding', 'Design', 'Digital Design', 'Direct',
    'Experiential', 'Gaming', 'Graphic Design', 'Illustration',
    'Impact / Act / Change', 'Innovation', 'Integrated', 'Music',
    'Outdoor Advertising', 'Packaging Design', 'Photography', 'PR',
    'Publishing', 'Radio & Audio Advertising', 'Social Media',
    'Use of Craft', 'Writing for Design',
  ],
  'Clio Awards': [
    'Branded Entertainment', 'Content & Contact', 'Creative Effectiveness',
    'Culture & Context', 'Design', 'Direct', 'Event & Experiential', 'Fashion',
    'Film', 'Film Technique', 'Health & Wellness', 'Innovation', 'Integration',
    'Out-of-Home', 'PR', 'Print', 'Radio & Audio', 'Social Media',
    'Sports', 'Student', 'Sustainable Development Goals',
  ],
  'One Show': [
    'Advertising', 'Brand Experience', 'Branded Entertainment', 'Branded Film',
    'Business Transformation', 'Content & Distribution', 'Craft',
    'Cultural Impact', 'Design', 'Digital/Mobile', 'Direct', 'Innovation',
    'Integrated', 'Market Disruption', 'Out of Home', 'PR', 'Promotions',
    'Radio & Audio', 'Social & Influencer', 'Spatial Design',
  ],
  'Effie APAC': [
    'Best Insights & Strategic Thinking', 'Best Integrated Campaign',
    'Best Launch', 'Best Long-Term Effects', 'Best New Product/Service',
    'Best Use of Data', 'Best Use of Digital', 'Best Use of Media', 'B2B',
    'Challenger Brand', 'Cultural Breakthrough', 'David vs. Goliath',
    'E-Commerce / Shopper Marketing', 'Engagement & Retention', 'Grand Effie',
    'Health & Wellness', 'Local Brand', 'Purpose-Driven Marketing',
    'Seasonal Marketing', 'Sustained Success',
  ],
  'WARC Awards': [
    'Creative Effectiveness', 'Content', 'Effective Channel Integration',
    'Effective Innovation', 'Grand Prix', 'Media Strategy', 'Social',
  ],
  'WARC Effectiveness Awards': [
    'Best Insight', 'Best Use of Data', 'Grand Prix', 'Long-Term Effectiveness',
    'New Brand or Product', 'Purpose', 'Short-Term Sales', 'Small Budget',
  ],
  'Spikes Asia': [
    'Audio & Radio', 'Brand Experience & Activation', 'Creative B2B',
    'Creative Commerce', 'Creative Data', 'Creative Effectiveness',
    'Creative Strategy', 'Design', 'Digital Craft', 'Direct', 'Entertainment',
    'Film', 'Film Craft', 'Gaming', 'Glass: The Award for Change', 'Healthcare',
    'Industry Craft', 'Innovation', 'Integrated', 'Media', 'Music', 'Outdoor',
    'PR', 'Print & Publishing', 'Social & Creator',
  ],
  'Dubai Lynx': [
    'Brand Experience & Activation', 'Creative Commerce', 'Creative Data',
    'Creative Strategy', 'Design', 'Digital', 'Direct', 'Entertainment',
    'Film', 'Film Craft', 'Health & Wellness', 'Innovation', 'Integrated',
    'Media', 'Mobile', 'Outdoor', 'PR', 'Print & Publishing', 'Radio & Audio',
    'Social & Influencer', 'Sustainable Development Goals',
  ],
  'Eurobest': [
    'Audio & Radio', 'Brand Experience & Activation', 'Creative B2B',
    'Creative Business Transformation', 'Creative Commerce', 'Creative Data',
    'Creative Effectiveness', 'Creative Strategy', 'Design', 'Digital Craft',
    'Direct', 'Entertainment', 'Film', 'Film Craft',
    'Glass: The Award for Change', 'Healthcare', 'Industry Craft',
    'Innovation', 'Integrated', 'Media', 'Outdoor', 'PR',
    'Print & Publishing', 'Social & Creator',
  ],
  'New York Festivals Advertising Awards': [
    'Advertising', 'Brand Design', 'Entertainment', 'Gaming',
    'Health & Wellness', 'Innovation', 'Interactive', 'Out of Home',
    'Branded Film', 'Radio & Audio', 'TV & Cinema',
  ],
  'London International Awards': [
    'Ambient & Activation',
    'Billboard',
    'Branded Content & Entertainment',
    'Creativity in Business-to-Business',
    'Creative Use of Data',
    'Creativity in the Metaverse',
    'Creativity in PR',
    'Design',
    'Digital',
    'Evolution',
    'Health & Wellness',
    'Health & Wellness – Craft',
    'Integration',
    'Music & Sound',
    'Music Video',
    'Non-Traditional',
    'Online Film',
    'Package Design',
    'Pharma & Medical',
    'Pharma & Medical – Craft',
    'Poster',
    'Print',
    'Production & Post-Production',
    'Radio & Audio',
    'Social Media & Influencers',
    'Television/Cinema',
    'Transformative Business Impact',
    'Sports',
    'Gaming',
    'Cultural Catalyst',
    'Entertainment & Content',
    'Business Transformation',
    'Democracy and Human Rights',
  ],
  'Campaign Big Awards': [
    'Advertising Effectiveness', 'Best of Show', 'Campaign Film',
    'Campaign of the Year', 'Creative Effectiveness', 'Direct & Data',
    'Digital & Social', 'Integrated Campaign', 'PR Campaign', 'Print & Outdoor',
    'Purpose Campaign', 'Radio & Audio',
  ],
  'Creative Circle': [
    'Best Art Direction', 'Best Campaign', 'Best Copywriting', 'Best Design',
    'Best Digital', 'Best Film', 'Best Integrated', 'Best Music/Audio',
    'Best Outdoor', 'Best PR Campaign', 'Gold Award',
  ],
  'Epica Awards': [
    'Film', 'Print', 'Radio', 'Digital', 'Integrated Campaigns',
    'Design', 'PR & Events', 'Experiential', 'Branded Content',
    'Film Craft', 'Print Craft', 'Social Media', 'Influencer Marketing',
    'Data-Driven', 'Artificial Intelligence', 'Virtual & Augmented Reality',
    'Sports Marketing', 'Seasonal Advertising', 'Humour', 'Public Interest',
    'B2B & Corporate', 'News-Jacking', 'Cultural Insight', 'Celebrity Collaborations',
    'Media Usage', 'Alternative Media', 'Self-Promotion',
  ],
  'Webby Awards': [
    'Websites & Mobile Sites', 'Video & Film', 'Advertising Media & PR',
    'Podcasts', 'Social & Games', 'Apps Software & Immersive', 'Creators', 'AI',
    'Branded Entertainment', 'Social Campaigns', 'PR Campaigns',
    'Branded Content', 'Integrated Campaign', 'Digital Campaign',
    'Interactive Online & Mobile', 'Experiential',
  ],
  'SABRE Awards Asia-Pacific': [
    'Consumer Marketing',
    'Corporate Reputation & Brand Communications',
    'Crisis & Issues Management',
    'Digital, Social & Influencer',
    'Employee Communications',
    'Financial & Investor Relations',
    'Government & Public Affairs',
    'Healthcare & Wellness',
    'Not-for-Profit & Social Impact',
    'Sustainability & ESG',
    'Technology',
    'Diamond SABRE — Long-term Reputation / Sustained Programme',
    'IN2 SABRE — Best Earned Media',
    'IN2 SABRE — Best Content',
    'IN2 SABRE — Best Data-Led Campaign',
    'IN2 SABRE — Best Digital/Social Campaign',
    'Innovation SABRE',
    'Geographic: Southeast Asia',
    'Geographic: North Asia',
    'Geographic: Australia/New Zealand',
    'Geographic: APAC Multi-Market',
    'Agency of the Year',
  ],
  'Global SABRE Awards': [
    'Best in Show (Top 40 Campaigns Worldwide)',
    'Global Agency of the Year',
    'Global Independent Agency of the Year',
    'Consumer Marketing',
    'Corporate Reputation',
    'Crisis Management',
    'Digital & Social',
    'Employee Communications',
    'Public Affairs',
    'Healthcare',
    'Sustainability & ESG',
    'Diamond SABRE — Long-term Reputation',
    'IN2 SABRE — Earned Media Excellence',
  ],
  'ICCO Global Awards': [
    'Large Consultancy of the Year',
    'Mid-size Consultancy of the Year',
    'Championing Diversity Award',
    'PR Leader of the Year',
    'Rising Star of the Year',
    'Automotive & Transport',
    'Technology',
    'Not-for-Profit or Charity',
    'Health, Wellness & Wellbeing',
    'Infrastructure (Construction, Energy, Manufacturing & Real Estate)',
    'Consumer, Sports & Entertainment',
    'Best Digital, New Media & Influencer',
    'Best B2B',
    'Best Internal Comms & Employer Branding',
    'Best ESG',
    'Best Strategy and Evaluation in a Campaign',
    'Best Media Relations',
    'Best Public Affairs',
    'Best Event, Launch or Stunt',
    'Best Crisis Management',
    'Campaign of the Year: Europe',
    'Campaign of the Year: Asia-Pacific, Middle East & Africa',
  ],
  'PRCA UK Awards': [
    'Automotive & Transport',
    'B2B',
    'B2B Technology',
    'Broadcast',
    'Consumer (High Budget)',
    'Consumer (Low Budget)',
    'Consumer Technology',
    'Corporate, Financial & Investor Relations',
    'Crisis & Issues Management',
    'Digital & Social Media',
    'Diversity, Equity & Inclusion',
    'Employee Engagement',
    'Health & Wellbeing',
    'International Campaign',
    'Media Relations',
    'Not-for-Profit & Charity',
    'Public Sector',
    'Purpose',
    'Small Consultancy',
    'Medium Consultancy',
    'Large Consultancy',
    'Specialist Consultancy',
    'New Consultancy',
    'International Consultancy',
    'In-House Team (Private Sector)',
    'In-House Team (Public Sector)',
    'Young Communicator of the Year',
    'PR Leader of the Year',
  ],
  'PRCA APAC Awards': [
    'Agency of the Year',
    'Small Consultancy of the Year',
    'Campaign of the Year',
    'B2B',
    'Consumer PR',
    'Corporate Communications',
    'Crisis & Issues Management',
    'Digital PR',
    'Employee Engagement',
    'Public Affairs',
    'Purpose & Sustainability',
    'Individual Award',
  ],
  'Shorty Awards': [
    'B2B', 'Brand Strategy', 'Community', 'Content Series',
    'Creative Use of Technology', 'Events & Experiential', 'Gaming',
    'Integration', 'Live Events', 'Long Form Video', 'Rebranding',
    'Short Form Video', 'Social Good', 'Social Media', 'Storytelling',
    'Use of Influencers',
  ],
  'Festival of Media APAC': [
    'Best Branded Content', 'Best Campaign for a Holiday or Celebration',
    'Best Campaign for a Specific Audience', 'Best Cause Campaign',
    'Best Communications Strategy', 'Best Engagement Strategy',
    'Best Event and Experiential Campaign', 'Best Integrated Campaign',
    'Best Launch or Relaunch Campaign', 'Best Local Brand Campaign',
    'Best Local Execution of a Global Brand', 'Best Music Marketing Campaign',
    'Best Partnership', 'Best Response Campaign', 'Best Viral Campaign',
    'Best Distribution and Amplification of Content', 'Best Retail Media Campaign',
    'The ROI Award', 'Best Use of Audio', 'Best Use of Data', 'Best Use of Gaming',
    'Best Use of Mobile', 'Best Use of Online', 'Best Use of Out of Home',
    'Best Use of Publishing', 'Best Use of Real-Time Marketing',
    'Best Use of Social Media', 'The Best Use of Sport', 'Best Use of Talent',
    'Best Use of Technology', 'Best Use of Video', 'Best Use of AI',
    'Best Search Campaign',
  ],
  'MMA Smarties APAC': [
    'Brand Purpose / Activism', 'Social Impact Marketing',
    'Diversity and Inclusive Excellence', 'Brand Experience',
    'Instant Impact / Promotion', 'Customer Growth & Conversion Strategy',
    'New Product or Service Launch / Re-launch', 'Real Time Marketing',
    'Small Budget, Big Impact', 'Creator / Influencer / Celebrity Marketing',
    'Partnership, PR & Branded Content Excellence', 'Omnichannel Marketing',
    'Cross Digital Media Marketing', 'Social Media Marketing',
    'AI Powered Data Insights / Contextual Marketing',
    'Advanced Technologies Marketing', 'Retail Media / O2O Excellence',
    'Audience Engagement Excellence Using AI',
    'Integrated E-commerce Innovation & Live Streaming',
    'Design / Customer / User Experience', 'Personalization',
    'Short or Long Form Video', 'Innovative Use of AI in Advertising',
    'AI-Driven Creative Excellence', 'D2C / E-commerce Marketing Excellence',
  ],
  'MMA Smarties Global': [
    'Brand Purpose / Activism', 'Social Impact Marketing',
    'Diversity and Inclusive Excellence', 'Brand Experience',
    'Instant Impact / Promotion', 'Customer Growth & Conversion Strategy',
    'New Product or Service Launch / Re-launch', 'Real Time Marketing',
    'Small Budget, Big Impact', 'Creator / Influencer / Celebrity Marketing',
    'Partnership, PR & Branded Content Excellence', 'Omnichannel Marketing',
    'Cross Digital Media Marketing', 'Social Media Marketing',
    'AI Powered Data Insights / Contextual Marketing',
    'Advanced Technologies Marketing', 'Retail Media / O2O Excellence',
    'Audience Engagement Excellence Using AI',
    'Integrated E-commerce Innovation & Live Streaming',
    'Design / Customer / User Experience', 'Personalization',
    'Short or Long Form Video', 'Innovative Use of AI in Advertising',
    'AI-Driven Creative Excellence', 'D2C / E-commerce Marketing Excellence',
  ],
  'ADFEST': [
    'Film Lotus',
    'Film Craft Lotus',
    'Digital & Social Lotus',
    'Digital Craft Lotus',
    'Design Lotus',
    'Outdoor Lotus',
    'Press Lotus',
    'Print & Outdoor Craft Lotus',
    'Radio & Audio Lotus',
    'Brand Experience Lotus',
    'Commerce Lotus',
    'Direct Lotus',
    'PR Lotus',
    'Media Lotus',
    'Effective Lotus',
    'Creative Strategy Lotus',
    'Entertainment Lotus',
    'INNOVA Lotus',
    'Lotus Roots',
    'New Director Lotus',
    'Sustainable Lotus',
  ],
  'Asian Marketing Effectiveness Awards': [
    'Best Awareness Campaign', 'Best Brand Experience', 'Best Digital Campaign',
    'Best Effectiveness Campaign', 'Best Integrated Campaign',
    'Best Mobile Campaign', 'Best PR Campaign', 'Best Use of Data', 'Grand Prix',
  ],
  'Asia Pacific Effie Awards': [
    'Best Use of Data', 'Brand Experience', 'Cultural Breakthrough',
    'E-Commerce', 'Grand Effie', 'Insight-Driven', 'Integrated Campaign',
    'Long-Term Effects', 'Media Innovation', 'New Product', 'Purpose',
    'Sustained Success',
  ],
  'Global Effie Awards': [
    'Best Global Campaign', 'Best Use of Insights', 'Cultural Breakthrough',
    'Grand Effie', 'Integrated Campaign', 'Long-Term Effects', 'Media Innovation',
    'New Product/Service', 'Purpose', 'Sustained Success',
  ],
  'Australian Effies': [
    'Best Insight', 'Best Use of Media', 'Brand Experience', 'David vs Goliath',
    'Effectiveness Grand Prix', 'Integrated Campaign', 'Long-Term Effects',
    'New Product Launch', 'Purpose', 'Short-Term Sales',
  ],
  'The Drum Awards Festival': [
    'Advertising', 'B2B', 'Content', 'Design', 'Digital Experience',
    'Experiential', 'Media', 'PR', 'Social', 'Social Purpose', 'Agency Business',
  ],
  'Loeries': [
    'Design',
    'Digital',
    'Film',
    'Live Communications',
    'Media Innovation',
    'Out of Home',
    'Print Communication',
    'PR & Media Communication',
    'Radio & Audio',
    'Student Awards',
    'Effective Creativity',
    'Social Impact Campaign',
    'Service Design',
    'B2B Creativity',
    'Comedic Impact',
    'New Launch Campaign',
    'Marketing Impact Award',
    'Integrated Campaign',
    'Young Creatives Award',
  ],
  'African Cristal Festival': [
    'Film', 'Digital', 'Print & OOH', 'Ambient & Experiential',
    'Social & Influencer', 'Audio', 'Brand Content', 'Direct', 'Healthcare',
    'Business to Business', 'Luxury & Fashion', 'Creative Technology',
    'Digital Design', 'Design', 'Film Craft', 'Print Craft', 'Digital Craft',
    'Brand Purpose', 'Brand Transformation', 'Social Impact', 'Brand Storytelling',
    'Long Term Creativity', 'Creative Strategy', 'Creative Commerce',
    'The Innovative Media Award', 'The Creative Effectiveness Award',
    'The Creative Business Award',
  ],
  'Campaign UK Agency of the Year': [
    'Branding Agency', 'Brand Experience Agency', 'Creative Agency',
    'Customer Engagement Agency', 'Digital Transformation Agency',
    'Independent PR Agency', 'Independent Media Agency', 'Independent Creative Agency',
    'In-House Agency', 'Integrated Marketing Agency', 'Media Agency',
    'Performance Marketing Agency', 'PR Agency', 'Start-Up Agency', 'Social Media Agency',
    'Account Person', 'Agency Producer', 'Creative Leader', 'Creative Team',
    'Head of Agency – Creative/Advertising', 'Head of Agency – Digital',
    'Head of Agency – Integrated Marketing', 'Head of Agency – Media', 'Head of Agency – PR',
    'Media Planning Leader', 'New Business Development Team/Person',
    'Strategic Leader', 'Strategist', 'Talent Management Team or Person',
  ],
  'Campaign US Agency of the Year': [
    'Ad Agency of the Year', 'AI Creative Studio', 'Design Studio',
    'Digital/Innovation Agency', 'Experiential Agency', 'Fastest Growing Agency',
    'Independent Agency', 'Influencer Agency', 'Media Agency', 'Multicultural Agency',
    'Account Person', 'Agency Leader', 'Creative Person', 'Inclusion Advocate',
    'Innovative Lead', 'Media Planner/Buyer', 'Strategist',
    'Content Team', 'Corporate Communications/Marketing Team', 'Creative Team',
    'Media Team', 'Pitch Team', 'Social Media Team', 'Strategy Team',
  ],
  'Campaign Global Agency of the Year': [
    'Global Network', 'Best Network: Asia Pacific', 'Best Network: Europe',
    'Best Network: Latin America', 'Best Network: Middle East & Africa', 'Best Network: North America',
    'Branding Agency', 'Brand Experience Agency', 'Consultancy', 'Creative Agency',
    'Customer Engagement Agency', 'Digital Transformation Agency',
    'Healthcare & Pharma Agency', 'Independent Creative/Advertising Agency',
    'Independent Media Agency', 'Independent PR Agency', 'In-House Agency',
    'Integrated Marketing Agency', 'Media Agency', 'Performance Agency',
    'PR Agency', 'Social Media Agency',
    'Account Person', 'Agency Growth Leader', 'Agency Leader', 'Creative Leader',
    'Creative Team', 'Head of Agency', 'New Business Development Team/Person',
    'Strategic Planning Leader', 'Talent Management Team/Person',
    'Global Inclusion Initiative', 'Best Place to Work',
  ],
  'Adweek Agency of the Year': [
    'Global Agency of the Year', 'International Agency of the Year',
    'U.S. Agency of the Year', 'Midsize Agency of the Year',
    'Small Agency of the Year', 'Breakthrough Agency of the Year',
    'Multicultural Agency of the Year', 'Independent Agency of the Year',
    'Agency Network of the Year', 'Social/Influencer Agency of the Year',
    'Innovation Agency of the Year',
  ],
  'One Show Indies': [
    'Branded Entertainment', 'Brand-Side / In-House', 'Creative Effectiveness',
    'Creative Marketer', 'Creative Use of AI', 'Creative Use of Data',
    'Creative Use of Technology', 'Creator Content', 'Cultural Driver',
    'Design & Branding', 'Design in Advertising', 'Direct Marketing',
    'Experiential & Immersive', 'Film & Video', 'Gaming', 'Health & Wellness',
    'Integrated / Omnichannel', 'Interactive Online & Mobile', 'IP & Product Design',
    'Moving Image Craft & Production', 'Music & Sound Craft', 'Out of Home',
    'Print & Promotional', 'Public Relations', 'Radio & Audio-First', 'Social Media',
  ],
}
