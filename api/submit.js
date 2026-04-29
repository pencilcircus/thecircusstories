// Vercel serverless function: POST /api/submit
// Receives proposal form submission from /for/7fingers-x7k2 and saves to Supabase

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};
  const reviewer = payload.reviewer || {};
  const decisions = payload.decisions || [];
  const additionalFeedback = payload.additionalFeedback || '';

  // Basic validation: at least a name OR email so we can attribute the submission
  if (!reviewer.name && !reviewer.email) {
    return res.status(400).json({ error: 'Reviewer name or email required' });
  }

  // Build the row to insert
  const row = {
    reviewer_name: reviewer.name || null,
    reviewer_email: reviewer.email || null,
    reviewer_role: reviewer.role || null,
    notes: additionalFeedback || null,
    questions_data: decisions,
    metadata: {
      ip: req.headers['x-forwarded-for'] || null,
      user_agent: req.headers['user-agent'] || null,
      submitted_via: 'proposal-page-7fingers',
    },
  };

  // Save to Supabase
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
        body: JSON.stringify(row),
      }
    );

    if (!supaRes.ok) {
      const errText = await supaRes.text();
      console.error('Supabase submit error:', supaRes.status, errText);
      return res.status(500).json({ error: 'Failed to save submission' });
    }
  } catch (e) {
    console.error('Supabase submit exception:', e.message);
    return res.status(500).json({ error: 'Submission failed', details: e.message });
  }

  return res.status(200).json({ success: true });
}
