// lib/press-kit.ts — Press Kit pure builder functions, extracted from
// app/projects/[id]/page.tsx (R1, refactor-r1r2-tabs-2026-07-13).
//
// These are parameterized versions of functions that used to close over
// React state directly on the page. Signatures were changed to take
// explicit params in place of the closures; the function BODIES are an
// unmodified, byte-for-byte move (the only in-body edit is
// `getOrgDisplayName()` -> `getOrgDisplayName(orgPressProfile)`, since
// getOrgDisplayName itself moved from a page closure to a pure function
// here). No HTML/PDF-generation logic changed.
//
// resolveFieldContent / getCurrentDraftFields / COLLAB_TYPE_LABELS
// intentionally did NOT move here — they're shared with other tabs
// (out of scope for this chunk) and stay on the page; COLLAB_TYPE_LABELS
// is imported back in (no logic to duplicate, it's a static label map),
// the other two are passed in as params below.

import { supabase } from '@/lib/supabase'
import type { Direction, Project, Collaborator, EntryDraft, OrgPressProfile, PressKitExtra } from '@/app/projects/[id]/page'
import { COLLAB_TYPE_LABELS } from '@/app/projects/[id]/page'

// Display name for the submitting org (press-kit-only; moved wholesale —
// not used anywhere else on the page).
export function getOrgDisplayName(orgPressProfile: OrgPressProfile | null): string {
  if (!orgPressProfile) return ''
  if (orgPressProfile.org_type === 'brand' && orgPressProfile.in_house_team_name) {
    return orgPressProfile.in_house_team_name
  }
  return orgPressProfile.agency_name || ''
}

// Build Outlook-safe HTML press kit for one direction
export function buildPressKitEmail(
  dirId: number,
  directions: Direction[],
  project: Project | null,
  collaborators: Collaborator[],
  orgPressProfile: OrgPressProfile | null,
  getCurrentDraftFields: (dirId: number) => EntryDraft[],
  resolveFieldContent: (d: EntryDraft) => string,
): string {
    const direction = directions.find(d => d.id === dirId)
    if (!direction || !project) return ''
    const fields = getCurrentDraftFields(dirId)
    const orgName = getOrgDisplayName(orgPressProfile)
    const pr = orgPressProfile

    // Colours
    const green = '#166534'
    const darkGray = '#111111'
    const midGray = '#555555'
    const lightGray = '#888888'
    const ruleColor = '#eeeeee'
    const placeholderBg = '#f9fafb'
    const placeholderBorder = '#d1d5db'

    const rule = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;"><tr><td style="border-top: 1px solid ${ruleColor}; font-size: 0; line-height: 0;">&nbsp;</td></tr></table>`

    // Build credits block
    const leadCollabs = collaborators.filter(c => c.is_lead_credit)
    const otherCollabs = collaborators.filter(c => !c.is_lead_credit)
    const allCredits = [...leadCollabs, ...otherCollabs]
    let creditsHtml = ''
    if (orgName || allCredits.length > 0) {
      const creditItems: string[] = []
      if (orgName) {
        creditItems.push(`<strong>${orgName}</strong>${pr?.tagline ? ` — ${pr.tagline}` : ''}`)
      }
      for (const c of allCredits) {
        creditItems.push(`${COLLAB_TYPE_LABELS[c.collaborator_type]}: ${c.collaborator_name}`)
      }
      creditsHtml = `
        <p style="margin: 0 0 6px 0; font-size: 11px; color: ${lightGray}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Credits</p>
        ${creditItems.map(item => `<p style="margin: 0 0 4px 0; font-size: 13px; color: ${midGray};">${item}</p>`).join('')}
        ${rule}`
    }

    // Build contact block
    let contactHtml = ''
    if (pr?.pr_contact_name || pr?.pr_contact_email) {
      const contactParts: string[] = []
      if (pr.pr_contact_name) contactParts.push(`<strong>${pr.pr_contact_name}</strong>`)
      if (pr.pr_contact_email) contactParts.push(`<a href="mailto:${pr.pr_contact_email}" style="color: ${green}; text-decoration: none;">${pr.pr_contact_email}</a>`)
      if (pr.pr_contact_phone) contactParts.push(pr.pr_contact_phone)
      if (pr.website_url) contactParts.push(`<a href="${pr.website_url}" style="color: ${green}; text-decoration: none;">${pr.website_url.replace(/^https?:\/\//, '')}</a>`)
      const socialParts: string[] = []
      if (pr.linkedin_url) socialParts.push(`LinkedIn: ${pr.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, '')}`)
      if (pr.x_handle) socialParts.push(`X: @${pr.x_handle.replace(/^@/, '')}`)
      if (pr.instagram_handle) socialParts.push(`Instagram: @${pr.instagram_handle.replace(/^@/, '')}`)
      contactHtml = `
        <p style="margin: 0 0 6px 0; font-size: 11px; color: ${lightGray}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Press Contact</p>
        <p style="margin: 0 0 4px 0; font-size: 13px; color: ${midGray}; line-height: 1.6;">${contactParts.join(' &nbsp;·&nbsp; ')}</p>
        ${socialParts.length > 0 ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: ${lightGray};">${socialParts.join(' &nbsp;·&nbsp; ')}</p>` : ''}
        ${rule}`
    }

    // Entry field sections
    const fieldsSections = fields.map(f => {
      const content = resolveFieldContent(f)
      if (!content) return ''
      // Preserve line breaks in the content
      const contentHtml = content.replace(/\n\n/g, '</p><p style="margin: 0 0 14px 0; font-size: 14px; line-height: 1.65; color: ' + darkGray + ';">').replace(/\n/g, '<br>')
      return `
        <p style="margin: 0 0 5px 0; font-size: 11px; color: ${lightGray}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${f.field_label}</p>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.65; color: ${darkGray};">${contentHtml}</p>`
    }).filter(Boolean).join('')

    // Date
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; font-family: Arial, Helvetica, sans-serif;">

  <!-- INTRO PLACEHOLDER -->
  <tr><td style="padding: 28px 0 0 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding: 14px 16px; background: ${placeholderBg}; border: 1px dashed ${placeholderBorder}; border-radius: 6px;">
      <p style="margin: 0; font-size: 13px; color: ${lightGray}; font-style: italic; line-height: 1.5;">
        [Add your personal introduction here &mdash; who you are, any shared context, and why you&rsquo;re sharing this work with them specifically.]
      </p>
    </td></tr>
    </table>
  </td></tr>

  <!-- SHOW CONTEXT -->
  <tr><td style="padding: 28px 0 0 0;">
    <p style="margin: 0 0 8px 0; font-size: 11px; color: ${lightGray}; text-transform: uppercase; letter-spacing: 0.8px; font-weight: bold;">
      ${direction.best_show || ''}${direction.best_category ? ' &nbsp;&middot;&nbsp; ' + direction.best_category : ''}
    </p>

    <!-- CAMPAIGN NAME -->
    <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: ${darkGray}; line-height: 1.2;">
      ${project.campaign_name}
    </p>

    <!-- CLIENT -->
    ${project.client_name ? `<p style="margin: 0 0 24px 0; font-size: 14px; color: ${lightGray};">for ${project.client_name}</p>` : `<p style="margin: 0 0 24px 0;"></p>`}

    ${direction.hook ? `
    <!-- HOOK -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
    <tr>
      <td width="3" style="background: ${green}; border-radius: 2px;">&nbsp;</td>
      <td width="12">&nbsp;</td>
      <td>
        <p style="margin: 0; font-size: 15px; color: ${darkGray}; font-style: italic; line-height: 1.6;">${direction.hook}</p>
      </td>
    </tr>
    </table>` : ''}
  </td></tr>

  ${rule}

  <!-- ENTRY FIELDS -->
  <tr><td>
    ${fieldsSections || `<p style="font-size: 14px; color: ${lightGray}; font-style: italic;">Generate an entry draft to populate this section.</p>`}
  </td></tr>

  ${rule}

  <!-- CREDITS -->
  <tr><td>
    ${creditsHtml}
  </td></tr>

  <!-- CONTACT -->
  <tr><td>
    ${contactHtml || ''}
  </td></tr>

  <!-- CLOSE PLACEHOLDER -->
  <tr><td style="padding: 0 0 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding: 14px 16px; background: ${placeholderBg}; border: 1px dashed ${placeholderBorder}; border-radius: 6px;">
      <p style="margin: 0; font-size: 13px; color: ${lightGray}; font-style: italic; line-height: 1.5;">
        [Your personal sign-off &mdash; e.g. &ldquo;Happy to share assets or a full case film. Let me know if you&rsquo;d like to talk through the work. Best, [Name]&rdquo;]
      </p>
    </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding: 16px 0; border-top: 1px solid ${ruleColor};">
    <p style="margin: 0; font-size: 11px; color: ${lightGray};">Generated by Shortlist &middot; ${today}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
  }


// Build social / summary extras for one direction
export function buildPressKitExtra(
  dirId: number,
  directions: Direction[],
  project: Project | null,
  orgPressProfile: OrgPressProfile | null,
  getCurrentDraftFields: (dirId: number) => EntryDraft[],
  resolveFieldContent: (d: EntryDraft) => string,
): PressKitExtra {
    const direction = directions.find(d => d.id === dirId)
    const empty: PressKitExtra = { quickSummary: '', pressHook: '', linkedinPost: '', xPost: '', instagramCaption: '' }
    if (!direction || !project) return empty

    const fields = getCurrentDraftFields(dirId)
    const orgName = getOrgDisplayName(orgPressProfile)
    const show = direction.best_show || ''
    const category = direction.best_category || ''
    const hook = direction.hook || direction.angle || ''
    const campaign = project.campaign_name
    const client = project.client_name || ''
    const showCategory = [category, show].filter(Boolean).join(' at ')

    // First entry field body (for LinkedIn/summary depth)
    const firstField = fields[0] ? resolveFieldContent(fields[0]) : ''
    const bodySnippet = firstField ? firstField.replace(/\n+/g, ' ').trim().slice(0, 220) + (firstField.length > 220 ? '…' : '') : ''

    // ── Quick Summary (2–3 sentences for email intros / press release openers) ──
    const summaryParts: string[] = []
    summaryParts.push(`${campaign}${client ? ` for ${client}` : ''}${orgName ? ` by ${orgName}` : ''} is entered in ${showCategory || 'the show'}.`)
    if (hook) summaryParts.push(hook)
    if (bodySnippet && bodySnippet !== hook) summaryParts.push(bodySnippet)
    const quickSummary = summaryParts.join(' ')

    // ── Press Hook (single punchy line tailored to show/category) ──
    const pressHook = hook
      ? `${campaign}${client ? ` for ${client}` : ''}: ${hook}`
      : `${campaign}${client ? ` for ${client}` : ''}${orgName ? `, by ${orgName}` : ''} — entered in ${showCategory || 'the show'}.`

    // ── LinkedIn Post ──
    const linkedinParts: string[] = []
    linkedinParts.push(`We've entered ${campaign}${client ? ` for ${client}` : ''} in ${showCategory || 'the show'}.`)
    if (hook) linkedinParts.push(`\n${hook}`)
    if (bodySnippet) linkedinParts.push(`\n${bodySnippet}`)
    if (orgName) linkedinParts.push(`\n— ${orgName}`)
    const showTag = show ? `#${show.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''
    const lgHashtags = ['#awards', showTag, '#advertising', '#creative'].filter(Boolean).join(' ')
    linkedinParts.push(`\n\n${lgHashtags}`)
    const linkedinPost = linkedinParts.join('\n')

    // ── X / Twitter Post (≤ 280 chars) ──
    const xCore = `${campaign}${client ? ` for ${client}` : ''}${showCategory ? ` — entered in ${showCategory}` : ''}. ${hook}`.trim()
    const xPost = xCore.length > 277 ? xCore.slice(0, 274) + '…' : xCore

    // ── Instagram Caption ──
    const igParts: string[] = []
    igParts.push(`${campaign}${client ? ` for ${client}` : ''} 🏆`)
    if (hook) igParts.push(hook)
    if (showCategory) igParts.push(`\nEntered in ${showCategory}.`)
    if (orgName) igParts.push(`\n${orgName}`)
    const igTag = show ? `#${show.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''
    const igHashtags = ['#awards', igTag, '#advertising', '#creative', '#design'].filter(Boolean).join(' ')
    igParts.push(`\n\n${igHashtags}`)
    const instagramCaption = igParts.join('\n')

    return { quickSummary, pressHook, linkedinPost, xPost, instagramCaption }
  }

// Copy formatted HTML to clipboard so it pastes as rich text in Outlook.
// Pure DOM/clipboard mechanics only — moved verbatim out of the old
// copyPressKitToClipboard; the pressKitCopied confirmation-flag state stays
// on the component, which calls this and sets its own timeout.
export async function copyHtmlToClipboard(html: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined') {
      const blob = new Blob([html], { type: 'text/html' })
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })])
    } else {
      // Fallback: create a temp div, select, copy via execCommand
      const div = document.createElement('div')
      div.innerHTML = html
      div.style.position = 'fixed'
      div.style.opacity = '0'
      div.style.pointerEvents = 'none'
      document.body.appendChild(div)
      const range = document.createRange()
      range.selectNode(div)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      document.execCommand('copy')
      window.getSelection()?.removeAllRanges()
      document.body.removeChild(div)
    }
    return true
  } catch {
    // Silent fail — clipboard access may be blocked in some contexts
    return false
  }
}

// Download PDF via jsPDF (dynamic import to avoid SSR issues)
export async function downloadPressKitPDF(
  dirId: number,
  directions: Direction[],
  project: Project | null,
  collaborators: Collaborator[],
  orgPressProfile: OrgPressProfile | null,
  getCurrentDraftFields: (dirId: number) => EntryDraft[],
  resolveFieldContent: (d: EntryDraft) => string,
): Promise<void> {
    const direction = directions.find(d => d.id === dirId)
    if (!direction || !project) return
    const fields = getCurrentDraftFields(dirId)
    const orgName = getOrgDisplayName(orgPressProfile)
    const pr = orgPressProfile

    try {
      const { jsPDF } = await import('jspdf' as never) as { jsPDF: new (o?: Record<string, unknown>) => {
        setFillColor: (r: number, g: number, b: number) => void
        rect: (x: number, y: number, w: number, h: number, style: string) => void
        setTextColor: (r: number, g: number, b: number) => void
        setFontSize: (size: number) => void
        setFont: (font: string, style: string) => void
        text: (text: string, x: number, y: number, opts?: Record<string, unknown>) => void
        splitTextToSize: (text: string, maxWidth: number) => string[]
        setDrawColor: (r: number, g: number, b: number) => void
        line: (x1: number, y1: number, x2: number, y2: number) => void
        addPage: () => void
        save: (filename: string) => void
        addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void
        internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
      } }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 20
      const contentW = pageW - margin * 2
      let y = 0

      const checkPage = (neededHeight: number) => {
        if (y + neededHeight > pageH - margin) { doc.addPage(); y = margin }
      }

      const rule = (gap = 8) => {
        doc.setDrawColor(225, 225, 225)
        doc.line(margin, y, pageW - margin, y)
        y += gap
      }

      const sectionLabel = (text: string) => {
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 101, 52) // green-800
        doc.text(text.toUpperCase(), margin, y)
        y += 5
      }

      // ── Header bar ──
      doc.setFillColor(22, 101, 52)
      doc.rect(0, 0, pageW, 16, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.text('PRESS KIT', margin, 10)

      // Show · Category badge (right-aligned in header)
      if (direction.best_show || direction.best_category) {
        const badge = [direction.best_show, direction.best_category].filter(Boolean).join('  ·  ')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.text(badge, pageW - margin, 10, { align: 'right' } as Record<string, unknown>)
      }

      y = 24

      // ── Logo (top-right, loaded async) ──
      if (pr?.logo_url) {
        try {
          const { data: { publicUrl } } = supabase.storage.from('org-logos').getPublicUrl(pr.logo_url)
          const logoDataUrl = await new Promise<string>((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              if (!ctx) { reject(new Error('no ctx')); return }
              ctx.drawImage(img, 0, 0)
              resolve(canvas.toDataURL('image/png'))
            }
            img.onerror = reject
            img.src = publicUrl
          })
          // Place logo top-right: max 32mm wide, max 14mm tall
          const tmpImg = new Image()
          tmpImg.src = logoDataUrl
          const aspect = tmpImg.naturalWidth / (tmpImg.naturalHeight || 1)
          const maxW = 32
          const maxH = 14
          const logoH = Math.min(maxH, maxW / (aspect || 1))
          const logoW = logoH * (aspect || 1)
          doc.addImage(logoDataUrl, 'PNG', pageW - margin - logoW, 18, logoW, logoH)
          y = Math.max(y, 18 + logoH + 4)
        } catch {
          // Logo load failed — continue without it
        }
      }

      // ── Campaign name ──
      doc.setTextColor(15, 15, 15)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      const nameLines = doc.splitTextToSize(project.campaign_name, contentW - (pr?.logo_url ? 36 : 0))
      nameLines.forEach((line: string) => { doc.text(line, margin, y); y += 9 })

      // ── Client ──
      if (project.client_name) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(120, 120, 120)
        doc.text(`for ${project.client_name}`, margin, y)
        y += 7
      }

      // ── Org name + tagline ──
      if (orgName) {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 101, 52)
        const orgLine = orgName + (pr?.tagline ? `  —  ${pr.tagline}` : '')
        doc.text(orgLine, margin, y)
        y += 7
      }

      // ── Hook ──
      if (direction.hook) {
        y += 3
        // Green accent bar
        doc.setFillColor(22, 101, 52)
        doc.rect(margin, y - 3.5, 2.5, 0, 'F') // placeholder — draw after measuring
        const hookLines = doc.splitTextToSize(direction.hook, contentW - 8)
        const hookBlockH = hookLines.length * 6 + 2
        checkPage(hookBlockH + 8)
        doc.setFillColor(22, 101, 52)
        doc.rect(margin, y - 3.5, 2.5, hookBlockH, 'F')
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bolditalic')
        doc.setTextColor(30, 30, 30)
        hookLines.forEach((line: string) => { doc.text(line, margin + 6, y); y += 6 })
        y += 6
      }

      y += 2
      rule(10)

      // ── Entry fields ──
      for (const f of fields) {
        const content = resolveFieldContent(f)
        if (!content) continue
        checkPage(22)
        sectionLabel(f.field_label)
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(25, 25, 25)
        const contentLines = doc.splitTextToSize(content, contentW)
        for (const line of contentLines) {
          checkPage(6)
          doc.text(line, margin, y)
          y += 5.5
        }
        y += 7
      }

      // ── Credits ──
      const leadCollabs = collaborators.filter(c => c.is_lead_credit)
      const otherCollabs = collaborators.filter(c => !c.is_lead_credit)
      const allCredits = [...leadCollabs, ...otherCollabs]
      if (orgName || allCredits.length > 0) {
        checkPage(22)
        rule(8)
        sectionLabel('Credits')
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(25, 25, 25)
        if (orgName) {
          doc.text(orgName, margin, y)
          if (pr?.tagline) {
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(120, 120, 120)
            doc.setFontSize(9.5)
            doc.text(pr.tagline, margin, y + 5)
            y += 5
          }
          y += 6
        }
        doc.setFontSize(10.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)
        for (const c of allCredits) {
          checkPage(6)
          doc.text(`${COLLAB_TYPE_LABELS[c.collaborator_type]}: ${c.collaborator_name}`, margin, y)
          y += 5.5
        }
        y += 4
      }

      // ── Press Contact ──
      if (pr?.pr_contact_name || pr?.pr_contact_email) {
        checkPage(22)
        rule(8)
        sectionLabel('Press Contact')
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(25, 25, 25)
        if (pr.pr_contact_name) { doc.text(pr.pr_contact_name, margin, y); y += 5.5 }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10.5)
        doc.setTextColor(60, 60, 60)
        const contactLine = [pr.pr_contact_email, pr.pr_contact_phone].filter(Boolean).join('  ·  ')
        if (contactLine) { doc.text(contactLine, margin, y); y += 5 }
        if (pr.website_url) {
          doc.setTextColor(22, 101, 52)
          doc.text(pr.website_url.replace(/^https?:\/\//, ''), margin, y)
          y += 5
        }
        const social = [
          pr.linkedin_url ? `LinkedIn: ${pr.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\//, '').replace(/\/$/, '')}` : '',
          pr.x_handle ? `X: @${pr.x_handle.replace(/^@/, '')}` : '',
          pr.instagram_handle ? `IG: @${pr.instagram_handle.replace(/^@/, '')}` : '',
        ].filter(Boolean).join('  ·  ')
        if (social) {
          doc.setTextColor(120, 120, 120)
          doc.setFontSize(9.5)
          doc.text(social, margin, y)
          y += 5
        }
      }

      // ── Footer ──
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 180, 180)
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(`Generated by Shortlist  ·  ${today}`, margin, pageH - 10)

      const safeShow = (direction.best_show || 'show').replace(/[^a-z0-9]/gi, '-').toLowerCase()
      const safeCampaign = project.campaign_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      doc.save(`${safeCampaign}-${safeShow}-press-kit.pdf`)
    } catch (err) {
      console.error('Press kit PDF generation failed:', err)
      alert('PDF generation failed. Make sure jspdf is installed.')
    }
  }
