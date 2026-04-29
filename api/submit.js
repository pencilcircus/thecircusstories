// Vercel serverless function: POST /api/submit
// Receives proposal form submission from /for/7fingers-x7k2:
//   1. Saves to Supabase (circus_stories_proposal_submissions)
//   2. Sends notification email via Resend to info@duoillumi.com

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};
  const reviewer = payload.reviewer || {};
  const decisions = payload.decisions || [];
  const additionalFeedback = payload.additionalFeedback || '';

  // No required fields — fully anonymous submissions allowed.
  // Only sanity check: must have at least some decisions or feedback.
  const hasDecisions = decisions.some(d => d.decision && d.decision !== 'pending');
  const hasFeedback = additionalFeedback.trim().length > 0;
  if (!hasDecisions && !hasFeedback) {
    return res.status(400).json({ error: 'No decisions or feedback to submit' });
  }

  const reviewerName = reviewer.name || null;
  const reviewerEmail = reviewer.email || null;
  const reviewerRole = reviewer.role || null;

  const errors = [];

  // ============================================
  // 1. Save to Supabase
  // ============================================
  try {
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/circus_stories_proposal_submissions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          reviewer_name: reviewerName,
          reviewer_email: reviewerEmail,
          reviewer_role: reviewerRole,
          notes: additionalFeedback || null,
          questions_data: decisions,
          metadata: {
            ip: req.headers['x-forwarded-for'] || null,
            user_agent: req.headers['user-agent'] || null,
            submitted_via: 'proposal-page-7fingers',
          },
        }),
      }
    );

    if (!supaRes.ok) {
      const errText = await supaRes.text();
      console.error('Supabase submit error:', supaRes.status, errText);
      errors.push(`Supabase: ${supaRes.status}`);
    }
  } catch (e) {
    console.error('Supabase submit exception:', e.message);
    errors.push(`Supabase exception: ${e.message}`);
  }

  // If Supabase failed completely, return error (we want the data persisted)
  if (errors.length > 0) {
    return res.status(500).json({ error: 'Failed to save submission', details: errors });
  }

  // ============================================
  // 2. Send notification email via Resend
  // ============================================
  if (process.env.RESEND_API_KEY) {
    try {
      // Build a readable HTML email body
      const reviewerLine = [
        reviewerName ? `<strong>${escapeHtml(reviewerName)}</strong>` : '<em style="color:#888;">No name given</em>',
        reviewerRole ? `(${escapeHtml(reviewerRole)})` : '',
        reviewerEmail ? `&middot; <a href="mailto:${escapeHtml(reviewerEmail)}">${escapeHtml(reviewerEmail)}</a>` : '',
      ].filter(Boolean).join(' ');

      const decisionsHtml = decisions.map((d) => {
        const decision = (d.decision || 'pending').toLowerCase();
        const colorMap = {
          approved: '#1f8a3b',
          'approve_with_edit': '#b97309',
          remove: '#c73a3a',
          pending: '#888',
        };
        const labelMap = {
          approved: 'APPROVED',
          'approve_with_edit': 'APPROVE WITH EDIT',
          remove: 'REMOVE',
          pending: 'No decision',
        };
        const color = colorMap[decision] || '#888';
        const label = labelMap[decision] || decision.toUpperCase();
        const editLine = d.edit ? `<div style="margin-top:8px; padding:10px 14px; background:#f7f2ea; border-left:3px solid #b97309; font-style:italic; color:#444;">Edit: ${escapeHtml(d.edit)}</div>` : '';
        return `
          <div style="margin:18px 0; padding:14px 18px; border:1px solid #e5e0d8; border-radius:4px;">
            <div style="font-family:monospace; font-size:11px; letter-spacing:0.08em; color:${color}; font-weight:bold; margin-bottom:6px;">
              Q${String(d.number).padStart(2,'0')} &middot; ${label}
            </div>
            <div style="color:#1A1612; line-height:1.5;">${escapeHtml(d.question || '')}</div>
            ${editLine}
          </div>
        `;
      }).join('');

      const feedbackBlock = additionalFeedback ? `
        <div style="margin-top:24px; padding:18px; background:#fbf6f4; border-left:4px solid #FF5757;">
          <div style="font-family:monospace; font-size:11px; letter-spacing:0.08em; color:#FF5757; font-weight:bold; margin-bottom:10px;">
            ANYTHING ELSE
          </div>
          <div style="color:#1A1612; line-height:1.6; white-space:pre-wrap;">${escapeHtml(additionalFeedback)}</div>
        </div>
      ` : '';

      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif; max-width:680px; margin:0 auto; padding:30px; color:#1A1612;">
          <div style="font-family:monospace; font-size:11px; letter-spacing:0.12em; color:#FF5757; font-weight:bold; margin-bottom:8px;">
            NEW PROPOSAL SUBMISSION
          </div>
          <h1 style="font-size:22px; color:#2A2420; margin:0 0 20px 0;">7 Fingers proposal — review submitted</h1>
          <div style="padding:14px 18px; background:#f7f2ea; border-radius:4px; margin-bottom:24px;">
            <div style="font-family:monospace; font-size:11px; letter-spacing:0.08em; color:#888; margin-bottom:6px;">FROM</div>
            <div style="color:#1A1612;">${reviewerLine}</div>
          </div>
          <h2 style="font-size:16px; color:#2A2420; margin:24px 0 12px 0;">Decisions</h2>
          ${decisionsHtml}
          ${feedbackBlock}
          <div style="margin-top:32px; padding-top:18px; border-top:1px solid #e5e0d8; font-size:12px; color:#888;">
            Submitted ${new Date().toISOString()} &middot; ${escapeHtml(req.headers['user-agent']?.slice(0, 80) || 'unknown')}
          </div>
        </div>
      `;

      const subjectName = reviewerName || (reviewerEmail || 'someone anonymous');
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
          to: [process.env.NOTIFY_EMAIL || 'info@duoillumi.com'],
          subject: `7 Fingers proposal — review from ${subjectName}`,
          html: html,
          reply_to: reviewerEmail || undefined,
        }),
      });
    } catch (e) {
      console.error('Resend notification failed:', e.message);
      // Don't fail the submission if notification fails — data already saved.
    }
  }

  return res.status(200).json({ success: true });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
