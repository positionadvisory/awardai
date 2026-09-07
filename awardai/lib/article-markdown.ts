// lib/article-markdown.ts — the article body renderer.
//
// EXTRACTED from app/articles/[slug]/page.tsx on 7 Sep 2026, when anchors were
// added. Two reasons it had to MOVE rather than be exported in place:
//
//   1. An app/**/page.tsx may export only `default` plus the route-segment
//      allowlist. `export function renderInline` there fails `next build` with
//      "not a valid Page export field", and that failure is INVISIBLE to
//      `tsc --noEmit` (S161). The renderer could not be exported for testing
//      while it lived in the page.
//   2. The fixtures that HAND-COPY their logic have already shipped a stale
//      assertion for eight days without anyone noticing — see the method note in
//      scripts/planner-engine-fixture.mjs. A renderer that escapes untrusted text
//      before it reaches dangerouslySetInnerHTML is the last thing that should be
//      tested against a copy.
//
// LEAF module, ZERO imports, so scripts/article-markdown-fixture.mjs imports this
// exact file through Node's native type stripping. Keep it that way: add an
// import here and the fixture stops testing the real thing.
//
// escapeHtml(), stripDuplicateTitle() and renderMarkdown()'s block handling are
// byte-identical to what they were in the page. The only behaviour change is
// anchors.

// ── S9 escaping (Session 50 audit) ───────────────────────────────────────────
// Escape raw HTML before any markdown transformation. Without this, HTML in
// article content goes straight into dangerouslySetInnerHTML: stored XSS on the
// public site. Escaping FIRST means the ONLY tags in the output are the ones
// renderMarkdown itself emits.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Emphasis ─────────────────────────────────────────────────────────────────
// Verbatim the old body of renderInline, so bold/italic behaviour on any line
// without a link is unchanged.
function emphasize(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

// ── Link scheme allowlist ────────────────────────────────────────────────────
// The href arrives ALREADY ESCAPED, and that is the whole reason it is safe to
// interpolate into an attribute: escapeHtml() has already turned " ' < > into
// entities, so nothing reaching here can close the attribute or open a tag.
// This function does NOT re-derive that property, it DEPENDS on it. Everything
// below is an allowlist stacked on top of the escaping, never a replacement for
// it. Do not reorder the pipeline to let this see a raw href.
//
// ALLOWED: absolute https, and root-relative ('/articles/x'). Nothing else.
// Deliberately NOT allowed:
//   http:        downgrade, and the site is https-only
//   //evil.com   protocol-relative: external, and carries no scheme for the
//                absolute branch to inspect
//   javascript:  script execution
//   data:, blob: script execution via a document the browser will render
//   #fragment    renderMarkdown emits no id attributes, so an in-page fragment
//                link has nothing to land on. Add heading ids FIRST, then add
//                '#' here, in that order.
function safeHref(escapedHref: string): string | null {
  const h = escapedHref
  if (!h) return null
  // Belt and braces. None of these can survive escapeHtml(), so a hit means the
  // caller handed us UNESCAPED text and the contract above is broken. Refuse
  // rather than emit: at that point the escaping guarantee is gone.
  if (/["'<>\\`\s]/.test(h)) return null
  // Root-relative, but not protocol-relative.
  if (h.charAt(0) === '/') return h.charAt(1) === '/' ? null : h
  // Absolute. Lowercased so 'HTTPS://' passes and a mixed-case scheme cannot be
  // smuggled past a case-sensitive compare. Requires something after the '//'.
  if (h.length > 8 && h.slice(0, 8).toLowerCase() === 'https://') return h
  return null
}

// ── Inline marks, applied to an ALREADY-ESCAPED line ─────────────────────────
// ANCHORS (7 Sep 2026). Links are pulled out FIRST, behind a sentinel, and put
// back LAST. The ordering is load-bearing, not stylistic:
//
//   - Run emphasis first and a '*' inside a URL is destroyed before the link is
//     ever recognised.
//   - Emit the anchor first and leave it in the string, and the emphasis pass
//     then runs over the finished href: a URL containing '*b*' gets an <em>
//     injected INSIDE an attribute.
//
// Tokenising is the only order where neither happens.
//
// SENTINEL. '<LINK0>' and friends. A '<' cannot appear in the input to this
// function, because escapeHtml() has already turned every one into '&lt;', so a
// pasted body cannot forge a sentinel and steal another link's href. Emphasis
// touches neither '<', '>', digits nor letters, so a sentinel passes through the
// emphasis step unchanged. Deliberately NOT a control character: an earlier
// draft used U+0000 and it is too easy to write the literal byte instead of the
// escape and never see it. The fixture asserts no '<LINK' survives in any output.
const SENTINEL_RE = /<LINK(\d+)>/g

export function renderInline(escaped: string): string {
  const anchors: string[] = []

  const withTokens = escaped.replace(
    // Link text may not contain brackets; href may not contain parens or
    // whitespace. Both bounds are deliberate: an unbounded capture over free
    // text is the OWNER_RE defect (S141).
    /\[([^[\]]*)\]\(([^()\s]*)\)/g,
    (whole: string, text: string, rawHref: string): string => {
      const href = safeHref(rawHref)
      // A rejected scheme renders as the literal text the author typed, so a bad
      // link is VISIBLE on the page rather than silently dropped.
      if (href === null) return whole
      // '[](url)' would emit an anchor with no accessible name.
      if (!text.trim()) return whole
      const rel = href.charAt(0) === '/' ? '' : ' rel="noopener noreferrer"'
      anchors.push('<a href="' + href + '"' + rel + '>' + emphasize(text) + '</a>')
      return '<LINK' + String(anchors.length - 1) + '>'
    },
  )

  return emphasize(withTokens).replace(
    SENTINEL_RE,
    (whole: string, index: string): string => {
      const a = anchors[Number(index)]
      // Unreachable unless a body forged a sentinel, which escapeHtml() prevents.
      // Emitting the literal text beats emitting an unknown tag.
      return a === undefined ? whole : a
    },
  )
}

// ── Block-level markdown ─────────────────────────────────────────────────────
// Very lightweight markdown -> HTML converter for article body.
// Handles: headings (#, ##, ###), bold (**text**), italic (*text*), links,
// paragraphs, blank lines, blockquotes (> ) and unordered lists (- / * ).
// Input is HTML-escaped line by line BEFORE markdown is applied — do not remove.
// The emitted tag set is therefore exactly:
//   h1 h2 h3 p strong em a blockquote ul li
//
// BLOCKQUOTE NOTE (S1, 2 Sep 2026): escapeHtml() runs first and turns '>' into
// '&gt;', so the blockquote marker is matched in its ESCAPED form ('&gt; ').
// This is deliberate: escapeHtml() and its position in the pipeline are the S9
// control and must not be reordered to make the raw marker visible. Anchors are
// matched the same way and for the same reason: '[', ']', '(' and ')' are all
// untouched by escapeHtml, so link syntax survives escaping intact.
//
// Headings deliberately do NOT run through renderInline. No copy-locked body has
// a link in a heading, and a heading link would also have to survive the
// duplicate-title comparison below.
export function renderMarkdown(md: string): string {
  const out: string[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length) {
      out.push(`<ul>${listItems.map(li => `<li>${li}</li>`).join('')}</ul>`)
      listItems = []
    }
  }

  for (const rawLine of md.split('\n')) {
    const trimmed = escapeHtml(rawLine.trim())

    // Unordered list item — '- ' or '* ' followed by whitespace. Neither marker is
    // altered by escapeHtml. Requiring the space means '*emphasis*' at the start of
    // a line is still italic, not a list.
    const listItem = trimmed.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      listItems.push(renderInline(listItem[1]))
      continue
    }
    flushList()

    if (!trimmed) { out.push('<p style="margin:0"></p>'); continue }
    if (trimmed.startsWith('### ')) { out.push(`<h3>${trimmed.slice(4)}</h3>`); continue }
    if (trimmed.startsWith('## ')) { out.push(`<h2>${trimmed.slice(3)}</h2>`); continue }
    if (trimmed.startsWith('# ')) { out.push(`<h1>${trimmed.slice(2)}</h1>`); continue }
    // Blockquote — '&gt; ' is the escaped form of '> '. 5 characters.
    if (trimmed.startsWith('&gt; ')) { out.push(`<blockquote>${renderInline(trimmed.slice(5))}</blockquote>`); continue }

    out.push(`<p>${renderInline(trimmed)}</p>`)
  }
  flushList()

  return out.join('\n')
}

// ── Duplicate-title strip ────────────────────────────────────────────────────
// Drop a leading '# Title' line when it repeats the article's own title.
//
// Every copy-locked article opens with its own '# Title' line, so renderMarkdown
// emitted an <h1> underneath the page's title <h1>: two h1s on every article.
//
// Deliberately narrow: the FIRST non-empty line only, only when it is an h1, and
// only when its text matches this article's title. A body whose first heading is
// a real, different h1 is left alone. This runs BEFORE renderMarkdown and before
// escapeHtml, so it is not in the S9 pipeline's path.
//
// The comparison ignores case, whitespace, markdown marks AND punctuation. The
// punctuation part is not cosmetic: run against the seven copy-locked bodies, a
// title typed without its trailing '?' or its '...' missed on four of seven
// (W1, W3, W4, W8), and a miss is silent — you get the duplicate h1 back with no
// error. Ignoring punctuation cannot cause a false strip: a leading h1 that
// equals the title apart from punctuation IS the title.
export function stripDuplicateTitle(content: string, title: string): string {
  const lines = content.split('\n')
  const i = lines.findIndex(l => l.trim() !== '')
  if (i === -1) return content
  const first = lines[i].trim()
  if (!first.startsWith('# ')) return content
  // ASCII punctuation plus curly quotes, en/em dash and ellipsis. Written as an
  // explicit punctuation list rather than \p{L}\p{N} with the /u flag, because
  // tsconfig sets no `target` and so defaults below es6 (TS1501). A positive
  // list also leaves accented and non-Latin letters intact, which /[^A-Za-z0-9]/
  // would strip.
  const PUNCT = /[!-\/:-@\[-\x60{-~–—‘’“”…]/g
  const norm = (s: string) =>
    s.replace(PUNCT, '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (norm(first.slice(2)) !== norm(title)) return content
  return lines.slice(i + 1).join('\n')
}
