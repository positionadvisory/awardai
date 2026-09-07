// scripts/article-markdown-fixture.mjs — article body renderer fixture.
// Added 7 Sep 2026 (APP-ARTICLE-ANCHORS).
//
// WHY THIS EXISTS. renderMarkdown() feeds dangerouslySetInnerHTML on a public
// page. Its safety property is ordering, not sanitisation: escapeHtml() runs
// FIRST, so the only tags in the output are the ones the renderer itself emits.
// Adding anchors puts a user-supplied string into an ATTRIBUTE for the first
// time, which is the one place that property can be broken by a change that
// looks harmless in a diff.
//
// METHOD, following scripts/shows-data-deadline-fixture.mjs. This fixture
// hand-copies NOTHING. lib/article-markdown.ts is a leaf module with zero
// imports, so Node's native type stripping (unflagged since 22.18) imports the
// real file. Change the renderer and this fixture sees the change. The two
// planner fixtures hand-copy their logic and one of them asserted a sixteen-day-
// old snapshot for eight days without anyone noticing.
//
// Run: node scripts/article-markdown-fixture.mjs
// Requires Node >= 22.18.

import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src  = resolve(here, '..', 'lib', 'article-markdown.ts')

const { renderMarkdown, renderInline, escapeHtml, stripDuplicateTitle } =
  await import(pathToFileURL(src).href)

let pass = 0, fail = 0
function is(label, got, want) {
  const ok = got === want
  if (ok) { pass++ } else {
    fail++
    console.error(`FAIL  ${label}\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`)
  }
}
function ok(label, cond) {
  if (cond) { pass++ } else { fail++; console.error(`FAIL  ${label}`) }
}
const p = md => renderMarkdown(md)

// ── 1. Links that must render ────────────────────────────────────────────────
is('absolute https',
  p('[the playbook](https://gotshortlisted.com/articles/x)'),
  '<p><a href="https://gotshortlisted.com/articles/x" rel="noopener noreferrer">the playbook</a></p>')
is('root-relative gets no rel',
  p('[chapter one](/articles/one)'),
  '<p><a href="/articles/one">chapter one</a></p>')
is('uppercase scheme is accepted',
  p('[x](HTTPS://a.co/y)'),
  '<p><a href="HTTPS://a.co/y" rel="noopener noreferrer">x</a></p>')
is('query string ampersand stays escaped',
  p('[x](https://a.co/?a=1&b=2)'),
  '<p><a href="https://a.co/?a=1&amp;b=2" rel="noopener noreferrer">x</a></p>')
is('link mid-sentence',
  p('See [it](https://a.co) now.'),
  '<p>See <a href="https://a.co" rel="noopener noreferrer">it</a> now.</p>')
is('two links on one line',
  p('[a](https://a.co) and [b](/b)'),
  '<p><a href="https://a.co" rel="noopener noreferrer">a</a> and <a href="/b">b</a></p>')

// ── 2. Schemes that must NOT render, and must stay visible as text ───────────
// A rejected link renders as the literal text the author typed. Silent removal
// would mean a typo'd link disappears from the page with no signal.
for (const [label, href] of [
  ['javascript:',        'javascript:alert1'],
  ['JAVASCRIPT: upper',  'JAVASCRIPT:alert1'],
  ['JaVaScRiPt: mixed',  'JaVaScRiPt:alert1'],
  ['data:',              'data:text/html;base64,PHNjcmlwdD4='],
  ['blob:',              'blob:https://a.co/uuid'],
  ['vbscript:',          'vbscript:msgbox'],
  ['file:',              'file:///etc/passwd'],
  ['http downgrade',     'http://evil.com'],
  ['protocol-relative',  '//evil.com'],
  ['bare scheme only',   'https://'],
  ['relative no slash',  'evil.com'],
  ['fragment',           '#chapter-one'],
]) {
  is(`rejected, rendered literal: ${label}`,
    p(`[click](${href})`), `<p>[click](${href})</p>`)
}
ok('no anchor emitted for any rejected scheme',
  ['javascript:a','data:a','//evil.com','http://e.co','#c']
    .every(h => !p(`[click](${h})`).includes('<a ')))

// ── 3. The attribute cannot be broken out of ────────────────────────────────
// escapeHtml() runs first, so a quote or angle bracket in the href is already an
// entity by the time safeHref sees it. These assert the property rather than
// trusting it.
ok('double quote in href cannot close the attribute',
  !p('[x](https://a.co/"onmouseover="alert(1))').includes('onmouseover="alert'))
ok('single quote in href is escaped',
  !p("[x](https://a.co/'z)").includes("'z"))
ok('angle bracket in href cannot open a tag',
  !p('[x](https://a.co/<script>)').includes('<script'))
is('raw html in link TEXT is escaped, not emitted',
  p('[<script>alert(1)</script>](https://a.co)'),
  '<p><a href="https://a.co" rel="noopener noreferrer">&lt;script&gt;alert(1)&lt;/script&gt;</a></p>')
ok('raw html anywhere in the body is still escaped',
  p('<img src=x onerror=alert(1)>').includes('&lt;img') &&
  !p('<img src=x onerror=alert(1)>').includes('<img'))

// ── 4. Ordering: emphasis must not reach inside an href ─────────────────────
// This is the whole reason links are tokenised rather than emitted in place.
is('asterisks in a URL survive intact',
  p('[x](https://a.co/*b*c)'),
  '<p><a href="https://a.co/*b*c" rel="noopener noreferrer">x</a></p>')
ok('no <em> is ever injected into an href',
  !p('[x](https://a.co/*b*c)').includes('href="https://a.co/<em>'))
is('bold inside link text still renders',
  p('[**bold**](https://a.co)'),
  '<p><a href="https://a.co" rel="noopener noreferrer"><strong>bold</strong></a></p>')
is('link inside emphasis still renders',
  p('*see [x](https://a.co) here*'),
  '<p><em>see <a href="https://a.co" rel="noopener noreferrer">x</a> here</em></p>')

// ── 5. The sentinel cannot be forged from a body ────────────────────────────
// '<' cannot survive escapeHtml, so a pasted '<LINK0>' is inert text.
is('a body containing the sentinel is inert',
  p('<LINK0> and [x](https://a.co)'),
  '<p>&lt;LINK0&gt; and <a href="https://a.co" rel="noopener noreferrer">x</a></p>')
ok('no sentinel survives into output',
  !['[a](https://a.co)','<LINK0>','[a](https://a.co) <LINK1> [b](/b)']
    .some(s => p(s).includes('<LINK')))

// ── 6. Degenerate link syntax ───────────────────────────────────────────────
is('empty link text is left alone', p('[](https://a.co)'), '<p>[](https://a.co)</p>')
is('whitespace-only link text is left alone', p('[   ](https://a.co)'), '<p>[   ](https://a.co)</p>')
is('empty href is left alone', p('[x]()'), '<p>[x]()</p>')
is('bare brackets, no href', p('[x]'), '<p>[x]</p>')
is('href with a space does not match', p('[x](https://a.co/a b)'), '<p>[x](https://a.co/a b)</p>')
is('nested brackets in text do not match', p('[a [b] c](https://a.co)'), '<p>[a [b] c](https://a.co)</p>')
is('unclosed paren does not match', p('[x](https://a.co'), '<p>[x](https://a.co</p>')

// ── 7. Links inside the other block types ───────────────────────────────────
is('link in a blockquote',
  p('> quoting [x](https://a.co)'),
  '<blockquote>quoting <a href="https://a.co" rel="noopener noreferrer">x</a></blockquote>')
is('link in a list item',
  p('- [x](https://a.co)'),
  '<ul><li><a href="https://a.co" rel="noopener noreferrer">x</a></li></ul>')
is('link NOT rendered in a heading (headings skip renderInline)',
  p('## [x](https://a.co)'),
  '<h2>[x](https://a.co)</h2>')

// ── 8. No regression on bodies with no links ────────────────────────────────
// Every assertion below held before anchors existed.
is('bold', p('**b**'), '<p><strong>b</strong></p>')
is('italic', p('*i*'), '<p><em>i</em></p>')
is('h1/h2/h3', p('# a\n## b\n### c'), '<h1>a</h1>\n<h2>b</h2>\n<h3>c</h3>')
is('blockquote', p('> q'), '<blockquote>q</blockquote>')
is('list', p('- a\n- b'), '<ul><li>a</li><li>b</li></ul>')
is('blank line', p(''), '<p style="margin:0"></p>')
is('runs of spaces are preserved', p('a b   c'), '<p>a b   c</p>')
is('ampersand in prose', p('Tom & Jerry'), '<p>Tom &amp; Jerry</p>')
is('apostrophe in prose', p("don't"), '<p>don&#39;t</p>')
is('escapeHtml unchanged', escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;')
is('renderInline on plain text is identity', renderInline('plain text'), 'plain text')

// ── 9. stripDuplicateTitle, unchanged by this change ────────────────────────
is('strips a matching leading h1',
  stripDuplicateTitle('# The Title\n\nBody', 'The Title'), '\nBody')
is('ignores punctuation when matching',
  stripDuplicateTitle('# The Title?\n\nBody', 'The Title'), '\nBody')
is('leaves a different leading h1',
  stripDuplicateTitle('# Something Else\n\nBody', 'The Title'), '# Something Else\n\nBody')
is('leaves a leading h2',
  stripDuplicateTitle('## The Title\n\nBody', 'The Title'), '## The Title\n\nBody')
is('handles a body with no heading',
  stripDuplicateTitle('Body', 'The Title'), 'Body')
is('handles an empty body', stripDuplicateTitle('', 'The Title'), '')
is('preserves accents', stripDuplicateTitle('# Café\n\nBody', 'Café'), '\nBody')

// ── 10. The emitted tag set is exactly what the comment claims ──────────────
const ALLOWED = ['h1','h2','h3','p','strong','em','a','blockquote','ul','li']
const kitchenSink = [
  '# H1', '## H2', '### H3', '', 'Para with **b**, *i* and [l](https://a.co).',
  '> Quote with [l](/x).', '- item with [l](https://a.co)', '- plain item',
  '<script>alert(1)</script>', '[bad](javascript:x)',
].join('\n')
const tags = Array.from(new Set(
  (renderMarkdown(kitchenSink).match(/<([a-zA-Z][a-zA-Z0-9]*)/g) || [])
    .map(t => t.slice(1).toLowerCase())
))
ok(`emitted tag set is a subset of the documented set (saw: ${tags.sort().join(',')})`,
  tags.every(t => ALLOWED.includes(t)))
ok('anchor tag is actually reachable', tags.includes('a'))

console.log(`\narticle-markdown fixture: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
