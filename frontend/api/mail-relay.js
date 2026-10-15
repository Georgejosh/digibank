/* eslint-env node */
/**
 * Mail relay - a Vercel serverless function that sends DigiBank's one-time
 * codes through Gmail.
 *
 * WHY IT EXISTS
 * Render's free plan blocks outbound SMTP ports, so the Django API cannot talk
 * to Gmail directly. Vercel functions can. Django POSTs the finished e-mail
 * here over HTTPS and this function hands it to Gmail.
 *
 * CREDENTIALS - two supported setups
 *  1. Pass-through (default, needs no Vercel settings): Django sends its own
 *     Gmail address + App Password with each request, over HTTPS. The function
 *     uses them for that one send and stores nothing. Without a valid Gmail
 *     login nobody can send anything through this endpoint.
 *  2. Vercel env (optional): GMAIL_USER, GMAIL_APP_PASSWORD and
 *     MAIL_RELAY_SECRET set on Vercel; callers then need the secret instead.
 *
 * Exactly one recipient per call, size-limited content, sender = the Gmail account.
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
  const body = req.body || {};
  const env = process.env;

  let user;
  let pass;
  if (env.MAIL_RELAY_SECRET && env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    if (!secretMatches(req.headers['x-relay-secret'], env.MAIL_RELAY_SECRET)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    user = env.GMAIL_USER;
    pass = env.GMAIL_APP_PASSWORD;
  } else {
    user = body.smtpUser;
    pass = body.smtpPass;
    if (typeof user !== 'string' || !EMAIL_RE.test(user) || typeof pass !== 'string' || !pass) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { to, subject, html, text, fromName } = body;
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
      auth: { user, pass: pass.replace(/\s/g, '') },
    });
    const info = await transporter.sendMail({ from: `"${name}" <${user}>`, to, subject, html, text });
    return res.status(200).json({ ok: true, id: info.messageId });
  } catch (err) {
    const msg = String(err && err.message);
    const auth = /Invalid login|Username and Password not accepted|535/i.test(msg);
    return res.status(auth ? 401 : 502).json({
      error: auth ? 'gmail_login_failed' : 'send_failed',
      detail: auth ? 'Gmail rejected the login. Check the address and the 16-letter App Password.' : msg.slice(0, 200),
    });
  }
}
