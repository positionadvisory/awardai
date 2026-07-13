'use client'
// lib/extract-entry-text.ts
//
// Browser-side entry text extraction, factored out of the Materials-tab
// handleFileUpload in app/projects/[id]/page.tsx so the trial first-run route
// (/start) extracts entries BYTE-FOR-BYTE the same way the real Materials tab
// does. Keeping one extraction path means a /start score can never diverge from
// the score the same file gets on the project page.
//
// This helper is deliberately storage-agnostic: it returns the extracted text
// plus any rendered chart-page image blobs, and lets the caller decide where to
// upload them (the storage key needs a project id the caller owns). It performs
// NO network or Supabase calls.
//
// S160: the project page's Materials-tab handleFileUpload is now wired to this
// module (the S158 inline copy was removed), so this is the ONLY extraction
// path. The Video Script tab's handleScriptFileUpload keeps its own simpler
// extractor DELIBERATELY (no AcroForm pass, no chart rendering, 10-char page
// threshold vs 80): scripts are prose documents, not entry PDFs. Do not
// "unify" it here without deciding those behavior changes explicitly.

export type ChartBlob = { pageNum: number; blob: Blob }
export type ExtractResult = {
  text: string
  chartBlobs: ChartBlob[]
  /** progress label the caller can surface while awaiting */
  lastStage?: string
}

const MAX_TEXT = 50000

export function fileExt(name: string): string {
  return (name.split('.').pop() || '').toLowerCase()
}

// Storage-key-safe filename (S110): Supabase Storage rejects keys with certain
// characters (square brackets among them). Sanitize the key's filename portion
// only; the display name keeps the original file.name.
export function safeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file'
}

export async function extractEntryText(
  file: File,
  onStage?: (label: string) => void,
): Promise<ExtractResult> {
  const ext = fileExt(file.name)
  const chartBlobs: ChartBlob[] = []
  let text = ''

  const arrayBuffer = await file.arrayBuffer()

  if (ext === 'txt') {
    text = new TextDecoder().decode(arrayBuffer).slice(0, MAX_TEXT)
  } else if (ext === 'docx') {
    try {
      onStage?.('Extracting text from document…')
      const mammoth = (await import('mammoth')).default
      const result = await mammoth.extractRawText({ arrayBuffer })
      text = result.value.slice(0, MAX_TEXT)
    } catch (err) { console.warn('DOCX extraction failed:', err) }
  } else if (ext === 'pdf') {
    try {
      onStage?.('Reading PDF…')
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
      const textParts: string[] = []
      const chartPageNums: number[] = []
      const formFields: Map<string, string> = new Map()

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)

        // 1. AcroForm field values (fillable PDF forms)
        try {
          const annotations = await page.getAnnotations()
          for (const ann of annotations as Array<{
            subtype?: string; annotationType?: number;
            fieldName?: string; fullName?: string;
            fieldValue?: unknown; currentValue?: unknown; defaultFieldValue?: unknown;
          }>) {
            const isWidget = ann.subtype === 'Widget' || ann.annotationType === 20
            const name = ann.fieldName || ann.fullName
            if (!isWidget || !name) continue
            const raw = ann.fieldValue ?? ann.currentValue ?? ann.defaultFieldValue
            if (typeof raw === 'string' && raw.trim() && !formFields.has(name)) {
              formFields.set(name, raw.trim())
            }
          }
        } catch { /* annotations optional */ }

        // 2. Text content stream
        const textContent = await page.getTextContent()
        const pageText = (textContent.items as Array<{ str?: string }>)
          .filter(item => typeof item.str === 'string')
          .map(item => item.str as string)
          .join(' ').trim()
        if (pageText.length > 80) { textParts.push(pageText) }
        else { chartPageNums.push(pageNum) }
      }

      const formFieldsBlock = formFields.size > 0
        ? `=== Form Fields ===\n${Array.from(formFields.entries()).map(([k, v]) => `${k}: ${v}`).join('\n')}\n=== End Form Fields ===\n\n`
        : ''
      text = (formFieldsBlock + textParts.join('\n\n')).slice(0, MAX_TEXT)

      if (chartPageNums.length > 0) {
        onStage?.(`Processing ${Math.min(chartPageNums.length, 8)} chart pages…`)
        for (const pageNum of chartPageNums.slice(0, 8)) {
          try {
            const page = await pdf.getPage(pageNum)
            const viewport = page.getViewport({ scale: 1.5 })
            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext('2d')
            if (!ctx) continue
            await page.render({ canvasContext: ctx, viewport }).promise
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
            if (blob) chartBlobs.push({ pageNum, blob })
          } catch (err) { console.warn(`Chart render failed for page ${pageNum}:`, err) }
        }
      }
    } catch (err) { console.warn('PDF processing failed:', err) }
  }

  return { text, chartBlobs }
}
