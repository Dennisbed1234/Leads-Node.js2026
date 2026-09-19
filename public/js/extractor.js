/* Email extractor + TXT export (Lite14-style paste → emails) */
(function () {
  'use strict';

  var EMAIL_RE = /[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,63}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+/g;
  var JUNK_LOCAL = { example:1, email:1, name:1, user:1, test:1, noreply:1, 'no-reply':1, donotreply:1, webmaster:1, postmaster:1 };
  var JUNK_DOMAIN = ['example.com','example.org','domain.com','sentry.io','wixpress.com','schema.org','w3.org','google.com','gstatic.com'];

  function deobfuscate(text) {
    if (!text) return '';
    var s = String(text);
    s = s.replace(/\s*[\[\(\{]?\s*(?:at|AT|@)\s*[\]\)\}]?\s*/g, '@');
    s = s.replace(/\s*[\[\(\{]?\s*(?:dot|DOT)\s*[\]\)\}]?\s*/g, '.');
    s = s.replace(/&#64;|&at;/gi, '@').replace(/&#46;/g, '.');
    s = s.replace(/(\w)\s+@\s+(\w)/g, '$1@$2');
    s = s.replace(/(\w)\s+\.\s+(\w)/g, '$1.$2');
    return s;
  }

  function isLikelyReal(email) {
    if (!email || email.length > 80) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    var parts = email.split('@');
    var local = parts[0], domain = parts[1];
    if (!local || local.length < 2 || JUNK_LOCAL[local]) return false;
    for (var i = 0; i < JUNK_DOMAIN.length; i++) {
      var d = JUNK_DOMAIN[i];
      if (domain === d || domain.slice(-(d.length + 1)) === '.' + d) return false;
    }
    if (/\.(png|jpg|jpeg|gif|svg|css|js)$/i.test(domain)) return false;
    if (/\{|\}|%s|xxx/i.test(email)) return false;
    return true;
  }

  function extractEmailsFromText(text) {
    var raw = String(text || '');
    var decoded = deobfuscate(raw);
    var found = (raw.match(EMAIL_RE) || []).concat(decoded.match(EMAIL_RE) || []);
    var out = [];
    var seen = {};
    for (var i = 0; i < found.length; i++) {
      var e = found[i].toLowerCase().trim();
      if (!isLikelyReal(e) || seen[e]) continue;
      seen[e] = true;
      out.push(e);
    }
    return out;
  }

  function getSep() {
    var el = document.querySelector('input[name="extractSep"]:checked');
    return el ? el.value : 'newline';
  }

  function formatList(emails) {
    var sort = document.getElementById('extractSort');
    var unique = document.getElementById('extractUnique');
    var list = emails.slice();
    if (unique && unique.checked) {
      var s = {}, u = [];
      list.forEach(function (e) { if (!s[e]) { s[e] = 1; u.push(e); } });
      list = u;
    }
    if (sort && sort.checked) list.sort();
    var sep = getSep();
    if (sep === 'comma') return list.join(', ');
    if (sep === 'semicolon') return list.join('; ');
    return list.join('\n');
  }

  function downloadBlob(filename, content, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime || 'text/plain' }));
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function wireExtractor() {
    var input = document.getElementById('extractInput');
    var output = document.getElementById('extractOutput');
    var countEl = document.getElementById('extractCount');
    var extractBtn = document.getElementById('extractBtn');
    var clearBtn = document.getElementById('extractClearBtn');
    var copyBtn = document.getElementById('extractCopyBtn');
    var txtBtn = document.getElementById('extractTxtBtn');
    if (!extractBtn || !input) return;

    var lastEmails = [];

    extractBtn.addEventListener('click', function () {
      lastEmails = extractEmailsFromText(input.value);
      output.value = formatList(lastEmails);
      countEl.textContent = lastEmails.length + ' email' + (lastEmails.length === 1 ? '' : 's');
    });

    document.querySelectorAll('input[name="extractSep"], #extractSort, #extractUnique').forEach(function (el) {
      el.addEventListener('change', function () {
        if (lastEmails.length) output.value = formatList(lastEmails);
      });
    });

    clearBtn && clearBtn.addEventListener('click', function () {
      input.value = '';
      output.value = '';
      lastEmails = [];
      countEl.textContent = '0 emails';
    });

    copyBtn && copyBtn.addEventListener('click', function () {
      if (!output.value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(output.value).then(function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () { copyBtn.textContent = 'Copy result'; }, 1500);
        });
      } else {
        output.select();
        document.execCommand('copy');
      }
    });

    txtBtn && txtBtn.addEventListener('click', function () {
      if (!output.value) { alert('Extract emails first.'); return; }
      downloadBlob('extracted_emails.txt', output.value, 'text/plain;charset=utf-8');
    });
  }

  function wireTxtExport() {
    var btn = document.getElementById('downloadTxtBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var rows = document.querySelectorAll('#resultsTable tbody tr');
      if (!rows.length) { alert('No data yet.'); return; }
      var lines = ['Source\tName\tEmail\tPhone\tAddress\tWebsite'];
      var emails = [];
      rows.forEach(function (tr) {
        var cells = tr.querySelectorAll('td');
        var vals = [];
        cells.forEach(function (td, i) {
          var t = (td.innerText || '').trim();
          if (i === 5) {
            var a = td.querySelector('a');
            t = a ? a.href : t;
          }
          vals.push(t === '—' ? '' : t);
        });
        lines.push(vals.join('\t'));
        var email = (cells[2] && cells[2].innerText || '').trim();
        if (email && email !== '—') emails.push(email);
      });
      var body = lines.join('\n') + '\n\n--- Emails only ---\n' + emails.join('\n');
      downloadBlob('us_leads_export.txt', body, 'text/plain;charset=utf-8');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      wireExtractor();
      wireTxtExport();
    });
  } else {
    wireExtractor();
    wireTxtExport();
  }
})();
