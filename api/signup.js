// Vercel serverless function: POST /api/signup
// Receives { email, source } and:
//   1. Adds to MailerLite group
//   2. Saves backup row in Supabase

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, source = 'homepage' } = req.body || {};

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const errors = [];

  // ============================================
  // 1. Add to MailerLite
  // ============================================
  try {
    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.MAILERLITE_API_TOKEN}`,
      },
      body: JSON.stringify({
        email: cleanEmail,
        groups: [process.env.MAILERLITE_GROUP_ID],
        status: 'active',
      }),
    });

    if (!mlRes.ok) {
      const errText = await mlRes.text();
      // 422 with "already in this group" is fine — silent success
      if (mlRes.status !== 422) {
        errors.push(`MailerLite: ${mlRes.status} ${errText.slice(0, 200)}`);
      }
    }
  } catch (e) {
    errors.push(`MailerLite error: ${e.message}`);
  }

  // ============================================
  // 2. Save to Supabase (backup, in CircusHub project)
  // ============================================
  try {
    const supaRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/circus_stories_email_signups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          email: cleanEmail,
          source: source,
          metadata: {
            ip: req.headers['x-forwarded-for'] || null,
            user_agent: req.headers['user-agent'] || null,
          },
        }),
      }
    );

    if (!supaRes.ok) {
      const errText = await supaRes.text();
      errors.push(`Supabase: ${supaRes.status} ${errText.slice(0, 200)}`);
    }
  } catch (e) {
    errors.push(`Supabase error: ${e.message}`);
  }

  // ============================================
  // Return success even if some services failed
  // (The user signed up — we don't want to fail the form)
  // ============================================
  return res.status(200).json({
    success: true,
    errors: errors.length ? errors : undefined,
  });
}
