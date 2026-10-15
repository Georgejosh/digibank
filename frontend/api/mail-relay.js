/* eslint-env node */
/**
 * Mail relay - a Vercel serverless function that sends DigiBank's one-time
 * codes through Gmail.
 *
 * WHY IT EXISTS
 * Render's free plan blocks outbound SMTP ports, so the Django API cannot talk
 * to Gmail directly. Vercel functions can. Django POSTs the finished e-mail
 * here over HTTPS with a shared secret, and this function hands it to Gmail.
 *
 * SECURITY
 *  - Only callers that present MAIL_RELAY_SECRET (compared in constant time)
 *    are served; everyone else gets 401. Without the secret this endpoint
 *    cannot be used to send mail.
 *  - Exactly one recipient per call, size-limited content, fixed sender.
 *
 * ENV (Vercel project settings): GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_RELAY_SECRET
 */
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function secretMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && b.length > 0 && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const { MAIL_RELAY_SECRET, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!secretMatches(req.headers['x-relay-secret'], MAIL_RELAY_SECRET)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return res.status(503).json({ error: 'relay_not_configured', detail: 'Set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel.' });
  }

  const { to, subject, html, text, fromName } = req.body || {};
  if (typeof to !== 'string' || !EMAIL_RE.test(to) || to.length > 254) {
    return res.status(400).json({ error: 'invalid_recipient' });
  }
  if (typeof subject !== 'string' || !subject || subject.length > 200) {
    return res.status(400).json({ error: 'invalid_subject' });
  }
  if ((html && html.length > 20000) || (text && text.length > 10000)) {
    return res.status(400).json({ error: 'content_too_large' });
  }

  const name = String(fromName || 'DigiBank').replace(/["<>\r\n]/g, '').slice(0, 60);
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s/g, '') },
    });
    const info = await transporter.sendMail({
      from: `"${name}" <${GMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });
    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (err) {
    return res.status(502).json({ error: 'send_failed', detail: String(err && err.message).slice(0, 200) });
  }
}
