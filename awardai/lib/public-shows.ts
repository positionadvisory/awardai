// lib/public-shows.ts: what the public /shows page may say about each show.
//
// SEO pass, 21 Oct 2026. The page publishes DATES ONLY, read live from
// DEADLINES_2026 in lib/shows-data.ts, so a date corrected there is corrected
// on the page with no second edit. A show appears with dates only when BOTH:
//   1. its DEADLINES_2026 row is confidence 'verified', checked at render, so a
//      row downgraded to 'partial' drops its dates from the page on its own; and
//   2. it has an entry here with a source URL, the organizer page a reader can
//      tap to check the date for themselves.
// Every other show is named in the "also tracked" line with no dates.
//
// NOT published here, deliberately: entry fees (the ENTRY_FEES ranges and
// notes were never reconciled for public use, and some carry ESTIMATE flags),
// category lists (SHOW_CATEGORIES is known wrong for at least One Show), and
// anything from the internal `note` fields, which name customers and sessions.
// The jury intelligence stays inside the product.
//
// `note` below is public copy, written from the row's internal note and its
// cited source. Keep it to facts the source page states. US English, no em
// dashes.

export type PublicShow = {
  slug: string
  source: string
  note?: string
}

export const PUBLIC_SHOWS: Record<string, PublicShow> = {
  'Cannes Lions': { slug: 'cannes-lions', source: 'https://www.canneslions.com/awards/awards-support/dates-and-fees' },
  'D&AD': { slug: 'dandad', source: 'https://www.dandad.org/awards' },
  'One Show': {
    slug: 'one-show',
    source: 'https://www.oneshow.org/',
    note: 'Entries open 27 October 2026. Fees rise after 11 December 2026, 22 January 2027 and 12 February 2027. Finalist and ceremony dates for 2027 are not yet published.',
  },
  'Clio Awards': {
    slug: 'clio-awards',
    source: 'https://clios.com/the-clio-awards/entry-information/',
    note: 'Fees rise after 23 October 2026, 11 December 2026 and 15 January 2027. Final deadline 19 February 2027 at 11:59pm EST. Shortlist 15 April 2027; ceremony in New York, May 2027.',
  },
  'Effie APAC': { slug: 'effie-apac', source: 'https://apaceffie.com' },
  'Festival of Media APAC': {
    slug: 'festival-of-media-apac',
    source: 'https://festivalofmedia.com/asia-pacific-media-awards/',
    note: 'Entries open 6 November 2026. Early deadline 4 December 2026, standard deadline 1 January 2027, extended deadline 29 January 2027. Shortlist 18 March 2027.',
  },
  'MMA Smarties APAC': { slug: 'smarties-apac', source: 'https://mmaglobal.com/smarties/awards/programs/asia-pacific' },
  'MMA Smarties Global': { slug: 'smarties-global', source: 'https://mmaglobal.com/smarties/awards/programs/global' },
  'Epica Awards': {
    slug: 'epica-awards',
    source: 'https://www.epica-awards.com/enter',
    note: 'Late entry, with a 10% surcharge, runs to 30 October, the final cutoff. Shortlist 25 November; ceremony 15 December.',
  },
  'Eurobest': { slug: 'eurobest', source: 'https://www.eurobest.com/support/dates-and-fees' },
  'Spikes Asia': {
    slug: 'spikes-asia',
    source: 'https://www.spikes.asia/news/spikes-asia-evolves-into-lions-asia',
    note: 'Renamed LIONS Asia in September 2026; its awards are now the Asia Lions. The festival moves from March to September, with the first edition in Singapore in September 2027. Entries open in April 2027. Exact dates are not yet published.',
  },
  'Campaign Asia Agency of the Year': { slug: 'campaign-asia-agency-of-the-year', source: 'https://www.aoyawards.com' },
  'Campaign Asia Women to Watch APAC': { slug: 'campaign-women-to-watch-apac', source: 'https://www.campaignwomentowatch.com' },
  'The Drum Awards Festival': { slug: 'the-drum-awards-festival', source: 'https://www.thedrumawards.com/live/en/page/faq' },
  'ADCE Awards': { slug: 'adce-awards', source: 'https://adceurope.awardhub.org/dates/' },
  'UK Agency Awards': { slug: 'uk-agency-awards', source: 'https://ukagencyawards.co/entry-essentials/' },
  'Mumbrella Awards': { slug: 'mumbrella-awards', source: 'https://mumbrella.com.au/mumbrellaawards' },
  'B&T Awards': { slug: 'bandt-awards', source: 'https://bandtawards.com.au' },
  'Cairns Crocodiles Awards': { slug: 'cairns-crocodiles', source: 'https://cairnscrocodiles.com/cairns-awards-2026/' },
  'SoMo Borac': { slug: 'somo-borac', source: 'https://somoborac.com/uvjeti-prijave-2026/' },
  'Effie Awards Croatia': { slug: 'effie-croatia', source: 'https://danikomunikacija.com/awards/effie' },
  'MIXX Awards Croatia': { slug: 'mixx-croatia', source: 'https://danikomunikacija.com/awards/mixx' },
  'BalCannes': { slug: 'balcannes', source: 'https://danikomunikacija.com/awards/balcannes' },
  'IdejaX': { slug: 'idejax', source: 'https://danikomunikacija.com/awards/idejax' },
}

// Rows in DEADLINES_2026 that are not shows a reader can enter on their own:
// Tangrams is folded into Spikes Asia, and Cristal Festival is on the
// generate-directions hide list. Neither is named publicly.
export const NOT_PUBLIC = new Set(['Tangrams', 'Cristal Festival'])
