/**
 * Shared email extraction / validation for public business pages.
 * Handles plain text, mailto, and common obfuscation (info [at] company.com).
 */

const EMAIL_RE =
  /[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,63}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;

const JUNK_LOCAL = new Set([
  'example', 'email', 'name', 'user', 'test', 'noreply', 'no-reply', 'donotreply',
  'mailer-daemon', 'postmaster', 'webmaster', 'abuse', 'privacy', 'support+',
  'yourname', 'youremail', 'username', 'firstname', 'lastname',
]);

const JUNK_DOMAIN = [
  'example.com', 'example.org', 'domain.com', 'email.com', 'sentry.io',
  'wixpress.com', 'schema.org', 'godaddy.com', 'squarespace.com',
  'google.com', 'gstatic.com', 'googleapis.com', 'w3.org', 'github.com',
  'cloudflare.com', 'jquery.com', 'fontawesome', 'gravatar.com',
  'placeholder.com', 'yoursite.com', 'mysite.com', 'company.com',
];

/** Decode common human-readable obfuscation before regex match. */
function deobfuscate(text) {
  if (!text) return '';
  let s = String(text);
  s = s.replace(/\s*[\[\(\{]?\s*(?:at|AT|@)\s*[\]\)\}]?\s*/g, '@');
  s = s.replace(/\s*[\[\(\{]?\s*(?:dot|DOT)\s*[\]\)\}]?\s*/g, '.');
  s = s.replace(/&#64;|&at;/gi, '@').replace(/&#46;/g, '.');
  s = s.replace(/(\w)\s+@\s+(\w)/g, '$1@$2');
  s = s.replace(/(\w)\s+\.\s+(\w)/g, '$1.$2');
  return s;
}

function extractEmails(text) {
  if (!text) return [];
  const raw = String(text);
  const decoded = deobfuscate(raw);
  const found = [
    ...(raw.match(EMAIL_RE) || []),
    ...(decoded.match(EMAIL_RE) || []),
  ];
  return [...new Set(found.map((e) => e.toLowerCase().trim()))].filter(isLikelyRealEmail);
}

function extractMailto(html) {
  if (!html) return [];
  const out = [];
  const re = /mailto:([^"'?\s>]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const raw = decodeURIComponent(m[1].split('?')[0]).toLowerCase().trim();
      if (raw.includes('@')) out.push(raw);
    } catch {
      const raw = m[1].split('?')[0].toLowerCase().trim();
      if (raw.includes('@')) out.push(raw);
    }
  }
  return [...new Set(out)].filter(isLikelyRealEmail);
}

function isLikelyRealEmail(email) {
  if (!email || email.length > 80) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (local.length < 2) return false;
  if (JUNK_LOCAL.has(local)) return false;
  if (JUNK_DOMAIN.some((d) => domain === d || domain.endsWith('.' + d))) return false;
  if (/\.(png|jpg|jpeg|gif|svg|css|js|woff2?)$/i.test(domain)) return false;
  if (local.includes('..') || domain.includes('..')) return false;
  if (!/\.[a-z]{2,}$/i.test(domain)) return false;
  if (/\{|\}|%s|xxx/i.test(email)) return false;
  return true;
}

function domainFromUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function scoreEmail(email, context = {}) {
  let score = 50;
  const [local, domain] = email.split('@');
  const siteDomain = context.siteDomain || '';
  if (siteDomain && (domain === siteDomain || domain.endsWith('.' + siteDomain))) score += 30;
  if (/^(info|contact|hello|sales|office|admin|support|inquiries|service|team|booking|appointments)$/i.test(local)) {
    score += 15;
  }
  if (/^(noreply|no-reply|donotreply)/i.test(local)) score -= 40;
  if (context.fromMailto) score += 10;
  if (context.fromContactPage) score += 10;
  return Math.max(0, Math.min(100, score));
}

module.exports = {
  extractEmails,
  extractMailto,
  isLikelyRealEmail,
  domainFromUrl,
  scoreEmail,
  deobfuscate,
  EMAIL_RE,
};
