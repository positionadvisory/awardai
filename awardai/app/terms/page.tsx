// Deploys to: app/terms/page.tsx
// Serves the Shortlist Terms of Use at gotshortlisted.com/terms

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Use — Shortlist',
  description: 'Terms of Use for Shortlist, the awards intelligence platform by Position Group Pte. Ltd.',
}

export default function TermsPage() {
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
          --warn: #fef3c7;
          --warn-border: #f59e0b;
        }
        .terms-body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          font-size: 16px;
          line-height: 1.7;
          color: var(--ink);
          background: #fff;
          min-height: 100vh;
        }
        .terms-header {
          background: var(--green);
          color: #fff;
          padding: 18px 32px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .terms-logo {
          width: 32px; height: 32px;
          background: rgba(255,255,255,0.15);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 16px; color: #fff;
          text-decoration: none;
        }
        .terms-brand {
          font-weight: 600;
          font-size: 17px;
          color: #fff;
          text-decoration: none;
          letter-spacing: -0.01em;
        }
        .terms-tag {
          margin-left: auto;
          font-size: 12px;
          background: rgba(255,255,255,0.15);
          padding: 3px 10px;
          border-radius: 20px;
          color: rgba(255,255,255,0.85);
        }
        .terms-page {
          max-width: 760px;
          margin: 0 auto;
          padding: 56px 32px 80px;
        }
        .terms-title-block { margin-bottom: 48px; }
        .terms-title-block h1 {
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 10px;
          color: var(--ink);
        }
        .terms-meta {
          font-size: 14px;
          color: var(--ink-light);
        }
        .terms-intro {
          background: var(--bone);
          border-left: 4px solid var(--green);
          padding: 18px 22px;
          border-radius: 0 8px 8px 0;
          margin-bottom: 48px;
          font-size: 15px;
          color: var(--ink-muted);
        }
        .terms-section { margin-bottom: 48px; }
        .terms-section h2 {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--ink);
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .terms-section h3 {
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          margin: 24px 0 8px;
        }
        .terms-p { margin-bottom: 12px; color: var(--ink-muted); font-size: 15px; }
        .terms-ul, .terms-ol {
          margin: 10px 0 14px 0;
          padding-left: 22px;
        }
        .terms-li {
          font-size: 15px;
          color: var(--ink-muted);
          margin-bottom: 6px;
          line-height: 1.6;
        }
        .terms-a { color: var(--green); text-decoration: none; }
        .terms-a:hover { text-decoration: underline; }
        .terms-commitments {
          background: var(--green-light);
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 20px 24px;
          margin: 16px 0 24px;
        }
        .terms-commitments p {
          margin-bottom: 8px;
          font-size: 15px;
          color: #14532d;
        }
        .terms-commitments p:last-child { margin-bottom: 0; }
        .terms-check { display: inline-block; width: 18px; color: var(--green); font-weight: 700; }
        .terms-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        .terms-table thead tr { background: #f9fafb; }
        .terms-table th {
          text-align: left;
          padding: 10px 14px;
          font-weight: 600;
          color: var(--ink);
          border-bottom: 2px solid var(--border);
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .terms-table td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          color: var(--ink-muted);
          vertical-align: top;
        }
        .terms-table tr:last-child td { border-bottom: none; }
        .terms-footer {
          border-top: 1px solid var(--border);
          padding: 28px 32px;
          text-align: center;
          font-size: 13px;
          color: var(--ink-light);
        }
        .terms-footer a { color: var(--ink-light); }
        .terms-footer a:hover { color: var(--green); }
        @media (max-width: 640px) {
          .terms-header { padding: 16px 20px; }
          .terms-page { padding: 40px 20px 64px; }
          .terms-table { font-size: 13px; }
          .terms-table th, .terms-table td { padding: 8px 10px; }
        }
      `}</style>

      <div className="terms-body">
        <header className="terms-header">
          <a className="terms-logo" href="/">S</a>
          <a className="terms-brand" href="/">Shortlist</a>
          <span className="terms-tag">Legal</span>
        </header>

        <div className="terms-page">

          <div className="terms-title-block">
            <h1>Terms of Use</h1>
            <p className="terms-meta">Position Group Pte. Ltd. &nbsp;&middot;&nbsp; Effective: 6 June 2026 &nbsp;&middot;&nbsp; Governing law: Singapore</p>
          </div>

          <div className="terms-intro">
            <strong>Plain-English summary:</strong> Shortlist is an awards intelligence tool. We don&apos;t sell your data. We don&apos;t use your materials to train AI. Your content belongs to you. These terms spell out the full legal basis for the service.
          </div>

          {/* Section 1 */}
          <section className="terms-section">
            <h2>1. What Shortlist is</h2>
            <p className="terms-p">Shortlist is an awards intelligence platform that helps creative professionals research award shows, draft entry submissions, and evaluate their work against historical winning patterns. It is operated by <strong>Position Group Pte. Ltd.</strong> (UEN: 202622800R), a company incorporated in Singapore (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).</p>
            <p className="terms-p">Access to Shortlist is provided as a subscription software service. By creating an account and using the platform, you agree to these Terms of Use.</p>
            <h3>What Shortlist does not do</h3>
            <p className="terms-p">Shortlist provides strategic direction and drafting assistance. It does not guarantee any award outcome. Entry results depend on factors entirely outside our control &mdash; including the quality of the submitted work, jury composition, competitive field, and category dynamics in any given year.</p>
            <p className="terms-p">Outputs generated by Shortlist are directional. They are not a substitute for the professional judgment of the people submitting the entry, and should be reviewed and refined before submission.</p>
          </section>

          {/* Section 2 */}
          <section className="terms-section">
            <h2>2. Your data and privacy</h2>
            <p className="terms-p">This is the most important section of these terms. We have written it to be explicit.</p>

            <h3>2a. What we store</h3>
            <p className="terms-p">When you use Shortlist, we store:</p>
            <ul className="terms-ul">
              <li className="terms-li"><strong>Account data</strong> &mdash; your name, email address, and organisation name.</li>
              <li className="terms-li"><strong>Campaign materials</strong> &mdash; documents, briefs, and other files you upload to the platform.</li>
              <li className="terms-li"><strong>Entry drafts and outputs</strong> &mdash; AI-generated content created during your sessions, and any edits you make to it.</li>
              <li className="terms-li"><strong>Usage logs</strong> &mdash; records of AI operations run in your account (e.g. evaluations generated, drafts generated), used for billing and platform improvement.</li>
            </ul>

            <h3>2b. What we do not do with your data</h3>
            <div className="terms-commitments">
              <p><span className="terms-check">&#10003;</span> <strong>We do not sell user data to third parties. Ever.</strong></p>
              <p><span className="terms-check">&#10003;</span> <strong>We do not use uploaded campaign materials to train any AI model.</strong></p>
              <p><span className="terms-check">&#10003;</span> <strong>Campaign materials uploaded by one user are never visible to, or accessible by, any other user or organisation on the platform.</strong> Each organisation&apos;s data is isolated at the database level.</p>
            </div>

            <h3>2c. How AI processing works</h3>
            <p className="terms-p">Shortlist uses the <strong>Anthropic API (Claude)</strong> to process inputs and generate outputs. When you run an evaluation, generate a draft, or use any AI feature in the platform, your input is sent to Anthropic&apos;s API in real time.</p>
            <p className="terms-p">Anthropic&apos;s API terms of service prohibit using API inputs to train models. Your inputs are processed transiently and are not retained by Anthropic for training purposes. You can review Anthropic&apos;s usage policy at <a className="terms-a" href="https://www.anthropic.com/policies/usage-policy" target="_blank" rel="noopener noreferrer">anthropic.com/policies/usage-policy</a>.</p>

            <h3>2d. Subprocessors</h3>
            <p className="terms-p">Your data passes through the following third-party services in the course of delivering the platform. Each is contractually bound to data protection standards appropriate to the nature of their processing.</p>
            <table className="terms-table">
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
                  <td>AI processing (entry evaluation, draft generation, directions)</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td><strong>Supabase</strong></td>
                  <td>Database, file storage, and authentication</td>
                  <td>Asia Pacific (Mumbai, India)</td>
                </tr>
                <tr>
                  <td><strong>Stripe</strong></td>
                  <td>Payment processing and subscription management</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td><strong>Vercel</strong></td>
                  <td>Application hosting and delivery</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td><strong>Resend</strong></td>
                  <td>Transactional email (billing notifications, platform invites)</td>
                  <td>United States</td>
                </tr>
              </tbody>
            </table>
            <p className="terms-p">We will update this list if our subprocessors change. Significant changes will be notified to users in advance.</p>
          </section>

          {/* Section 3 */}
          <section className="terms-section">
            <h2>3. Your responsibilities</h2>
            <p className="terms-p">You are responsible for ensuring you have the right to upload any materials to the platform. This includes obtaining any necessary permissions from clients whose campaign materials you are uploading on their behalf.</p>
            <p className="terms-p">You may not upload materials that are confidential to a third party without that party&apos;s consent. Where client materials are uploaded, you represent that you have the authorisation to do so.</p>
            <p className="terms-p">Shortlist takes no responsibility for materials uploaded without appropriate authorisation. If we receive a credible claim that uploaded content infringes a third party&apos;s rights, we may remove it and notify the account holder.</p>
            <p className="terms-p">You are also responsible for keeping your account credentials secure. You should not share your login with others who are not members of your organisation&apos;s Shortlist account.</p>
          </section>

          {/* Section 4 */}
          <section className="terms-section">
            <h2>4. Intellectual property</h2>
            <p className="terms-p"><strong>Your content is yours.</strong> You retain full ownership of all materials you upload to the platform and all outputs generated using your materials. Position Group Pte. Ltd. does not claim any intellectual property rights over user-uploaded content or AI-generated outputs produced in your account.</p>
            <p className="terms-p"><strong>Our platform is ours.</strong> The Shortlist platform, its interface, underlying technology, award show intelligence data, and all associated proprietary content remain the intellectual property of Position Group Pte. Ltd. Nothing in these terms transfers any rights in the platform to you.</p>
            <p className="terms-p">You grant us a limited, non-exclusive licence to process your uploaded materials solely for the purpose of providing the service to you.</p>
          </section>

          {/* Section 5 */}
          <section className="terms-section">
            <h2>5. Liability</h2>
            <p className="terms-p"><strong>Cap on liability.</strong> To the maximum extent permitted by applicable law, our total liability to you for any claim arising out of or in connection with these terms or your use of the platform is limited to the subscription fees you paid to us in the 12 months immediately preceding the event giving rise to the claim.</p>
            <p className="terms-p"><strong>Exclusions.</strong> We are not liable for any indirect, consequential, incidental, or special loss, including loss of revenue, loss of profit, loss of business opportunity, or loss of data &mdash; even if we were advised of the possibility of such loss.</p>
            <p className="terms-p"><strong>Award outcomes.</strong> We are not liable for the outcome of any award submission. The platform provides intelligence, drafting assistance, and strategic direction. Whether a submission wins, is shortlisted, or places depends on factors entirely beyond our control, including jury decisions, competitive field, and the quality of the final work submitted.</p>
            <p className="terms-p">Nothing in these terms limits our liability for fraud, gross negligence, or any liability that cannot be excluded by law.</p>
          </section>

          {/* Section 6 */}
          <section className="terms-section">
            <h2>6. Subscriptions and cancellation</h2>
            <p className="terms-p"><strong>Billing.</strong> Subscriptions are billed monthly, in advance. Your subscription begins with a 7-day free trial; a valid payment method is required to start the trial. If you do not cancel before the trial ends, you will be charged the monthly subscription fee.</p>
            <p className="terms-p"><strong>Cancellation.</strong> You can cancel your subscription at any time from your account settings. On cancellation, you retain access to the platform until the end of your current paid billing period. We do not provide refunds for any unused portion of a billing period.</p>
            <p className="terms-p"><strong>Data after cancellation.</strong> Following the end of your subscription, your account data and uploaded materials will be retained for 90 days to allow for reactivation or data export. After this period, your data will be permanently deleted from our systems. We are not responsible for loss of data following this deletion window.</p>
            <p className="terms-p">If you wish to export your data before deletion, contact us at <a className="terms-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>.</p>
          </section>

          {/* Section 7 */}
          <section className="terms-section">
            <h2>7. Changes to these terms</h2>
            <p className="terms-p">We may update these terms from time to time. If we make material changes, we will notify you by email at least 14 days before the changes take effect. The notification will describe what is changing and why.</p>
            <p className="terms-p">Your continued use of the platform after the effective date of updated terms constitutes your acceptance of the revised terms. If you do not agree to the changes, you should cancel your subscription before the effective date.</p>
            <p className="terms-p">Minor changes &mdash; such as corrections or clarifications that do not affect your rights &mdash; may be made without advance notice.</p>
          </section>

          {/* Section 8 */}
          <section className="terms-section">
            <h2>8. General</h2>
            <p className="terms-p"><strong>Governing law.</strong> These terms are governed by the laws of Singapore. Any disputes arising out of or in connection with these terms shall be subject to the non-exclusive jurisdiction of the courts of Singapore.</p>
            <p className="terms-p"><strong>Entire agreement.</strong> These terms constitute the entire agreement between you and Position Group Pte. Ltd. regarding your use of the platform.</p>
            <p className="terms-p"><strong>Severability.</strong> If any provision of these terms is found to be unenforceable, the remaining provisions will continue in full force and effect.</p>
            <p className="terms-p"><strong>Contact.</strong> Questions about these terms? Email us at <a className="terms-a" href="mailto:ben@positionadvisory.com">ben@positionadvisory.com</a>.</p>
          </section>

        </div>

        <footer className="terms-footer">
          <p>
            <a href="/">gotshortlisted.com</a>
            &nbsp;&middot;&nbsp;
            Position Group Pte. Ltd. (UEN: 202622800R)
            &nbsp;&middot;&nbsp;
            Effective 6 June 2026
          </p>
        </footer>
      </div>
    </>
  )
}
