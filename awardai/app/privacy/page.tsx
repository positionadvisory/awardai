// Deploys to: app/privacy/page.tsx
// Serves the Shortlist Privacy Policy at gotshortlisted.com/privacy

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Shortlist',
  description: 'Privacy Policy for Shortlist, the awards intelligence platform by Position Group Pte. Ltd.',
}

export default function PrivacyPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --ink: #1a1a1a;
          --ink-muted: #555;
          --ink-light: #888;
          --green: #166534;
          --green-light: #dcfce7;
          --bone: #f9f6f1;
          --border: #e5e7eb;
        }
        .pp-body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          font-size: 16px;
          line-height: 1.7;
          color: var(--ink);
          background: #fff;
          min-height: 100vh;
        }
        .pp-header {
          background: var(--green);
          color: #fff;
          padding: 18px 32px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pp-logo {
          width: 32px; height: 32px;
          background: rgba(255,255,255,0.15);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 16px; color: #fff;
          text-decoration: none;
        }
        .pp-brand {
          font-weight: 600; font-size: 17px;
          color: #fff; text-decoration: none;
          letter-spacing: -0.01em;
        }
        .pp-tag {
          margin-left: auto;
          font-size: 12px;
          background: rgba(255,255,255,0.15);
          padding: 3px 10px;
          border-radius: 20px;
          color: rgba(255,255,255,0.85);
        }
        .pp-page {
          max-width: 760px;
          margin: 0 auto;
          padding: 56px 32px 80px;
        }
        .pp-title-block { margin-bottom: 48px; }
        .pp-title-block h1 {
          font-size: 28px; font-weight: 700;
          letter-spacing: -0.02em; margin-bottom: 10px;
          color: var(--ink);
        }
        .pp-meta { font-size: 14px; color: var(--ink-light); }
        .pp-intro {
          background: var(--bone);
          border-left: 4px solid var(--green);
          padding: 18px 22px;
          border-radius: 0 8px 8px 0;
          margin-bottom: 48px;
          font-size: 15px; color: var(--ink-muted);
        }
        .pp-section { margin-bottom: 48px; }
        .pp-section h2 {
          font-size: 18px; font-weight: 700;
          letter-spacing: -0.01em; color: var(--ink);
          margin-bottom: 16px; padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .pp-section h3 {
          font-size: 15px; font-weight: 600;
          color: var(--ink); margin: 24px 0 8px;
        }
        .pp-p { margin-bottom: 12px; color: var(--ink-muted); font-size: 15px; }
        .pp-p:last-child { margin-bottom: 0; }
        .pp-ul, .pp-ol { margin: 10px 0 14px 0; padding-left: 22px; }
        .pp-li {
          font-size: 15px; color: var(--ink-muted);
          margin-bottom: 6px; line-height: 1.6;
        }
        .pp-a { color: var(--green); text-decoration: none; }
        .pp-a:hover { text-decoration: underline; }
        .pp-rights {
          background: var(--green-light);
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 20px 24px;
          margin: 16px 0 24px;
        }
        .pp-rights p {
          font-size: 15px; color: #14532d;
          margin-bottom: 8px;
        }
        .pp-rights p:last-child { margin-bottom: 0; }
        .pp-check { display: inline-block; width: 18px; color: var(--green); font-weight: 700; }
        .pp-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        .pp-table thead tr { background: #f9fafb; }
        .pp-table th {
          text-align: left; padding: 10px 14px;
          font-weight: 600; color: var(--ink);
          border-bottom: 2px solid var(--border);
          font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em;
        }
        .pp-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          color: var(--ink-muted); vertical-align: top;
        }
        .pp-table tr:last-child td { border-bottom: none; }
        .pp-footer {
          border-top: 1px solid var(--border);
          padding: 28px 32px;
          text-align: center;
          font-size: 13px; color: var(--ink-light);
        }
        .pp-footer a { color: var(--ink-light); }
        .pp-footer a:hover { color: var(--green); }
        @media (max-width: 640px) {
          .pp-header { padding: 16px 20px; }
          .pp-page { padding: 40px 20px 64px; }
          .pp-table { font-size: 13px; }
          .pp-table th, .pp-table td { padding: 8px 10px; }
        }
      `}</style>

      <div className="pp-body">
        <header className="pp-header">
          <a className="pp-logo" href="/">S</a>
          <a className="pp-brand" href="/">Shortlist</a>
          <span className="pp-tag">Legal</span>
        </header>

        <div className="pp-page">

          <div className="pp-title-block">
            <h1>Privacy Policy</h1>
            <p className="pp-meta">Position Group Pte. Ltd. &nbsp;&middot;&nbsp; Effective: 6 June 2026 &nbsp;&middot;&nbsp; Governing law: Singapore</p>
          </div>

          <div className="pp-intro">
            <strong>Plain-English summary:</strong> We collect only what we need to run the service. We don&apos;t sell your data. We don&apos;t use your uploaded materials to train AI. You can ask us to delete your data at any time.
          </div>

          {/* Section 1 */}
          <section className="pp-section">
            <h2>1. Who we are</h2>
            <p className="pp-p">Shortlist is operated by <strong>Position Group Pte. Ltd.</strong> (UEN: 202622800R), incorporated in Singapore. We are the data controller for the personal data processed in connection with the Shortlist platform at <a className="pp-a" href="https://gotshortlisted.com">gotshortlisted.com</a>.</p>
            <p className="pp-p">If you have questions about how we handle your data, contact us at <a className="pp-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>.</p>
          </section>

          {/* Section 2 */}
          <section className="pp-section">
            <h2>2. What data we collect</h2>

            <h3>Data you give us directly</h3>
            <ul className="pp-ul">
              <li className="pp-li"><strong>Account data</strong> &mdash; your name, email address, and organisation name, provided when you create an account.</li>
              <li className="pp-li"><strong>Campaign materials</strong> &mdash; documents, briefs, and other files you upload to the platform.</li>
              <li className="pp-li"><strong>Entry drafts and AI outputs</strong> &mdash; content generated during your sessions and any edits you make to it.</li>
              <li className="pp-li"><strong>Payment data</strong> &mdash; billing details collected and held by Stripe. We do not store card numbers or bank details.</li>
              <li className="pp-li"><strong>Communications</strong> &mdash; emails or messages you send us (e.g. support requests).</li>
            </ul>

            <h3>Data collected automatically</h3>
            <ul className="pp-ul">
              <li className="pp-li"><strong>Usage logs</strong> &mdash; records of AI operations run in your account (e.g. evaluations, drafts generated), including timestamps and token counts. Used for billing and platform improvement.</li>
              <li className="pp-li"><strong>Log data</strong> &mdash; standard server logs including IP address, browser type, and pages accessed. Retained for up to 90 days for security and debugging purposes.</li>
            </ul>

            <h3>Cookies</h3>
            <p className="pp-p">We use only essential cookies required for authentication and session management. We do not use tracking or advertising cookies. No third-party tracking scripts are loaded on the platform.</p>
          </section>

          {/* Section 3 */}
          <section className="pp-section">
            <h2>3. How we use your data</h2>

            <table className="pp-table">
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Data used</th>
                  <th>Legal basis</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Providing the platform and its AI features</td>
                  <td>Account data, campaign materials, usage logs</td>
                  <td>Performance of contract</td>
                </tr>
                <tr>
                  <td>Processing payments and managing subscriptions</td>
                  <td>Account data, billing data (via Stripe)</td>
                  <td>Performance of contract</td>
                </tr>
                <tr>
                  <td>Sending transactional emails (billing, account, platform invites)</td>
                  <td>Name, email address</td>
                  <td>Performance of contract</td>
                </tr>
                <tr>
                  <td>Responding to support requests</td>
                  <td>Account data, communications</td>
                  <td>Legitimate interests</td>
                </tr>
                <tr>
                  <td>Security monitoring and debugging</td>
                  <td>Log data, usage logs</td>
                  <td>Legitimate interests</td>
                </tr>
                <tr>
                  <td>Improving the platform</td>
                  <td>Aggregated, anonymised usage data only</td>
                  <td>Legitimate interests</td>
                </tr>
                <tr>
                  <td>Complying with legal obligations</td>
                  <td>As required by applicable law</td>
                  <td>Legal obligation</td>
                </tr>
              </tbody>
            </table>

            <p className="pp-p">We do not use your data for any purpose not listed here without notifying you first.</p>
          </section>

          {/* Section 4 */}
          <section className="pp-section">
            <h2>4. What we do not do</h2>
            <div className="pp-rights">
              <p><span className="pp-check">✓</span> <strong>We do not sell your personal data to any third party. Ever.</strong></p>
              <p><span className="pp-check">✓</span> <strong>We do not use your uploaded campaign materials to train any AI model.</strong></p>
              <p><span className="pp-check">✓</span> <strong>Your campaign materials are never visible to or accessible by any other user or organisation on the platform.</strong></p>
              <p><span className="pp-check">✓</span> <strong>We do not serve advertising and do not share your data with advertisers.</strong></p>
            </div>
          </section>

          {/* Section 5 */}
          <section className="pp-section">
            <h2>5. AI processing</h2>
            <p className="pp-p">Shortlist uses the <strong>Anthropic API (Claude)</strong> to process inputs and generate outputs. When you use any AI feature on the platform, your input is transmitted to Anthropic&apos;s API in real time for processing.</p>
            <p className="pp-p">Anthropic&apos;s API terms of service prohibit using API inputs to train models. Your inputs are processed transiently and are not retained by Anthropic for model training. You can review Anthropic&apos;s usage policy at <a className="pp-a" href="https://www.anthropic.com/policies/usage-policy" target="_blank" rel="noopener noreferrer">anthropic.com/policies/usage-policy</a>.</p>
            <p className="pp-p">Outputs generated by Shortlist belong to you. See our <a className="pp-a" href="/terms">Terms of Use</a> for full details on intellectual property.</p>
          </section>

          {/* Section 6 */}
          <section className="pp-section">
            <h2>6. Who we share data with</h2>
            <p className="pp-p">We share data only with the subprocessors required to deliver the service. Each is bound by data processing agreements and appropriate data protection standards.</p>

            <table className="pp-table">
              <thead>
                <tr>
                  <th>Subprocessor</th>
                  <th>Purpose</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Anthropic</strong></td>
                  <td>AI processing</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td><strong>Supabase</strong></td>
                  <td>Database, file storage, authentication</td>
                  <td>Asia Pacific (Mumbai, India)</td>
                </tr>
                <tr>
                  <td><strong>Stripe</strong></td>
                  <td>Payment processing</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td><strong>Vercel</strong></td>
                  <td>Application hosting</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td><strong>Resend</strong></td>
                  <td>Transactional email</td>
                  <td>United States</td>
                </tr>
              </tbody>
            </table>

            <p className="pp-p">We may also disclose data where required by law, court order, or to protect the safety and security of the platform or its users.</p>
            <p className="pp-p">We will update the subprocessor list if our processors change and will notify you of significant changes.</p>
          </section>

          {/* Section 7 */}
          <section className="pp-section">
            <h2>7. International data transfers</h2>
            <p className="pp-p">Some of our subprocessors are located in the United States. By using Shortlist, you acknowledge that your data may be transferred to and processed in the United States and other countries where data protection laws may differ from those in your country.</p>
            <p className="pp-p">Where transfers occur, we rely on appropriate safeguards including standard contractual clauses and the data processing agreements in place with each subprocessor.</p>
          </section>

          {/* Section 8 */}
          <section className="pp-section">
            <h2>8. How long we keep your data</h2>
            <p className="pp-p">We retain your data for as long as your account is active and for a period after cancellation to allow for reactivation or data export.</p>
            <ul className="pp-ul">
              <li className="pp-li"><strong>Active accounts</strong> &mdash; data is retained for the duration of your subscription.</li>
              <li className="pp-li"><strong>After cancellation</strong> &mdash; account data and uploaded materials are retained for 90 days, then permanently deleted.</li>
              <li className="pp-li"><strong>Billing records</strong> &mdash; retained for 7 years as required by Singapore accounting and tax law.</li>
              <li className="pp-li"><strong>Server logs</strong> &mdash; retained for up to 90 days.</li>
            </ul>
            <p className="pp-p">You can request early deletion of your account data at any time by contacting us at <a className="pp-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>. Billing records are excluded from deletion requests where retention is legally required.</p>
          </section>

          {/* Section 9 */}
          <section className="pp-section">
            <h2>9. Your rights</h2>
            <p className="pp-p">Under Singapore&apos;s Personal Data Protection Act (PDPA) and, where applicable, the EU General Data Protection Regulation (GDPR), you have the following rights regarding your personal data:</p>
            <div className="pp-rights">
              <p><span className="pp-check">→</span> <strong>Access</strong> &mdash; request a copy of the personal data we hold about you.</p>
              <p><span className="pp-check">→</span> <strong>Correction</strong> &mdash; ask us to correct inaccurate or incomplete data.</p>
              <p><span className="pp-check">→</span> <strong>Deletion</strong> &mdash; request that we delete your personal data (subject to legal retention obligations).</p>
              <p><span className="pp-check">→</span> <strong>Portability</strong> &mdash; receive your data in a structured, machine-readable format.</p>
              <p><span className="pp-check">→</span> <strong>Objection</strong> &mdash; object to processing based on legitimate interests.</p>
              <p><span className="pp-check">→</span> <strong>Withdrawal of consent</strong> &mdash; where processing is based on consent, withdraw it at any time.</p>
            </div>
            <p className="pp-p">To exercise any of these rights, email us at <a className="pp-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>. We will respond within 30 days. We may need to verify your identity before processing the request.</p>
            <p className="pp-p">If you are an EU resident and believe we have not handled your data in accordance with applicable law, you have the right to lodge a complaint with your local data protection authority.</p>
          </section>

          {/* Section 10 */}
          <section className="pp-section">
            <h2>10. Data security</h2>
            <p className="pp-p">We implement appropriate technical and organisational measures to protect your personal data, including:</p>
            <ul className="pp-ul">
              <li className="pp-li">All data in transit is encrypted using TLS.</li>
              <li className="pp-li">Data at rest is encrypted by our database provider (Supabase).</li>
              <li className="pp-li">Each organisation&apos;s data is isolated at the database level using row-level security policies.</li>
              <li className="pp-li">Access to production systems is restricted to authorised personnel.</li>
            </ul>
            <p className="pp-p">No system is completely secure. If you believe your account has been compromised, contact us immediately at <a className="pp-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>.</p>
          </section>

          {/* Section 11 */}
          <section className="pp-section">
            <h2>11. Children</h2>
            <p className="pp-p">Shortlist is a professional tool intended for use by adults. We do not knowingly collect personal data from anyone under the age of 18. If we become aware that we have collected data from a minor, we will delete it promptly.</p>
          </section>

          {/* Section 12 */}
          <section className="pp-section">
            <h2>12. Changes to this policy</h2>
            <p className="pp-p">We may update this Privacy Policy from time to time. If we make material changes, we will notify you by email at least 14 days before the changes take effect.</p>
            <p className="pp-p">The current version is always available at <a className="pp-a" href="/privacy">gotshortlisted.com/privacy</a>. The effective date at the top of this page indicates when it was last updated.</p>
          </section>

          {/* Section 13 */}
          <section className="pp-section">
            <h2>13. Contact</h2>
            <p className="pp-p">For any questions about this Privacy Policy or how we handle your data:</p>
            <p className="pp-p">
              <strong>Position Group Pte. Ltd.</strong><br />
              UEN: 202622800R<br />
              Singapore<br />
              <a className="pp-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>
            </p>
          </section>

        </div>

        <footer className="pp-footer">
          <p>
            <a href="/">gotshortlisted.com</a>
            &nbsp;&middot;&nbsp;
            Position Group Pte. Ltd. (UEN: 202622800R)
            &nbsp;&middot;&nbsp;
            Effective 6 June 2026
            &nbsp;&middot;&nbsp;
            <a href="/terms">Terms of Use</a>
          </p>
        </footer>
      </div>
    </>
  )
}
