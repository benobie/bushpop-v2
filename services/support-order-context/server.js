'use strict';

// Thin order-context lookup for the Bushpop Chatwoot support inbox.
// Serves a Chatwoot "Dashboard App" iframe that shows a buyer's WooCommerce
// order history inline in the conversation sidebar. No database of its own —
// every lookup is a live, server-side call to bushpop.com.au's WooCommerce
// REST API using a read-only key. See README.md for the full design/threat model.

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const WC_BASE_URL = (process.env.WC_BASE_URL || '').replace(/\/+$/, '');
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY || '';
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET || '';
const ORDER_CONTEXT_TOKEN = process.env.ORDER_CONTEXT_TOKEN || '';
const WC_TIMEOUT_MS = 8000;

for (const [name, value] of Object.entries({
  WC_BASE_URL,
  WC_CONSUMER_KEY,
  WC_CONSUMER_SECRET,
  ORDER_CONTEXT_TOKEN,
})) {
  if (!value) {
    console.error(`[order-context] missing required env var ${name} — refusing to start`);
    process.exit(1);
  }
}

const WC_AUTH_HEADER = 'Basic ' + Buffer.from(`${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`).toString('base64');

function log(fields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}

// Constant-time token check. Always compares against a fixed-length buffer
// first so a missing/short token doesn't short-circuit before timingSafeEqual runs.
function tokenMatches(provided) {
  const expected = Buffer.from(ORDER_CONTEXT_TOKEN);
  const actual = Buffer.from(String(provided || ''));
  if (actual.length !== expected.length) {
    crypto.timingSafeEqual(Buffer.alloc(expected.length), expected);
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

async function wcFetch(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WC_TIMEOUT_MS);
  try {
    const res = await fetch(`${WC_BASE_URL}${path}`, {
      headers: { Authorization: WC_AUTH_HEADER, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`WooCommerce ${path} -> HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function lookupOrdersByEmail(email) {
  // Registered buyers: resolve a customer_id first for a precise match.
  const customers = await wcFetch(`/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`);
  let orders;
  if (Array.isArray(customers) && customers.length > 0 && customers[0] && customers[0].id) {
    orders = await wcFetch(
      `/wp-json/wc/v3/orders?customer=${customers[0].id}&per_page=20&orderby=date&order=desc`
    );
  } else {
    // Guest checkouts have no customer record — WooCommerce's `search` param
    // matches against billing email among other order fields.
    orders = await wcFetch(
      `/wp-json/wc/v3/orders?search=${encodeURIComponent(email)}&per_page=20&orderby=date&order=desc`
    );
  }
  if (!Array.isArray(orders)) return [];
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    date: o.date_created,
    status: o.status,
    total: o.total,
    currency: o.currency,
    items: Array.isArray(o.line_items)
      ? o.line_items.map((li) => ({ name: li.name, quantity: li.quantity }))
      : [],
  }));
}

const INDEX_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Order context</title>
<style>
  body { font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 12px; color: #1f2937; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin: 0 0 10px; }
  .order { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
  .order .row1 { display: flex; justify-content: space-between; font-weight: 600; }
  .order .row2 { color: #6b7280; margin-top: 2px; }
  .status { display: inline-block; padding: 1px 6px; border-radius: 999px; background: #f3f4f6; font-size: 11px; }
  .items { margin-top: 6px; font-size: 12px; color: #374151; }
  .empty, .error, .loading { color: #6b7280; padding: 8px 0; }
  .error { color: #b91c1c; }
</style>
</head>
<body>
<h2>Order history</h2>
<div id="root" class="loading">Waiting for conversation context&hellip;</div>
<script>
(function () {
  var root = document.getElementById('root');
  var token = new URLSearchParams(window.location.search).get('token') || '';
  var handled = false;

  function extractEmail(payload) {
    // Chatwoot's Dashboard App postMessage envelope has shifted shape across
    // versions historically — try the documented current shape first, then
    // fall back to a couple of plausible alternates. VERIFY LIVE against the
    // deployed Chatwoot version (log(event.data) in devtools) and trim this
    // once confirmed — see README.md.
    return (
      (payload && payload.data && payload.data.contact && payload.data.contact.email) ||
      (payload && payload.contact && payload.contact.email) ||
      (payload && payload.data && payload.data.email) ||
      null
    );
  }

  function render(state, data) {
    if (state === 'empty') {
      root.className = 'empty';
      root.textContent = 'No orders found for this contact.';
      return;
    }
    if (state === 'error') {
      root.className = 'error';
      root.textContent = 'Could not load order history (' + data + ').';
      return;
    }
    root.className = '';
    root.innerHTML = data
      .map(function (o) {
        var items = (o.items || [])
          .map(function (li) { return li.quantity + '&times; ' + escapeHtml(li.name); })
          .join(', ');
        return (
          '<div class="order">' +
          '<div class="row1"><span>#' + escapeHtml(String(o.number || o.id)) + '</span>' +
          '<span>' + escapeHtml(o.currency || '') + ' ' + escapeHtml(String(o.total || '')) + '</span></div>' +
          '<div class="row2"><span class="status">' + escapeHtml(o.status || '') + '</span> &middot; ' +
          escapeHtml((o.date || '').slice(0, 10)) + '</div>' +
          (items ? '<div class="items">' + items + '</div>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function lookup(email) {
    if (handled) return;
    handled = true;
    root.className = 'loading';
    root.textContent = 'Looking up orders for ' + email + '…';
    fetch('api/orders?token=' + encodeURIComponent(token) + '&email=' + encodeURIComponent(email))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (body) {
        var orders = body.orders || [];
        if (!orders.length) return render('empty');
        render('ok', orders);
      })
      .catch(function (err) {
        handled = false;
        render('error', err && err.message ? err.message : String(err));
      });
  }

  window.addEventListener('message', function (event) {
    var payload = event.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { return; }
    }
    var email = extractEmail(payload);
    if (email) lookup(email);
  });
})();
</script>
</body>
</html>
`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/orders') {
    const token = url.searchParams.get('token');
    const email = url.searchParams.get('email');

    if (!tokenMatches(token)) {
      log({ route: '/api/orders', tokenValid: false });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }

    if (!email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing email' }));
      return;
    }

    try {
      const orders = await lookupOrdersByEmail(email);
      log({ route: '/api/orders', tokenValid: true, email, resultCount: orders.length });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orders }));
    } catch (err) {
      log({ route: '/api/orders', tokenValid: true, email, error: String((err && err.message) || err) });
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'lookup failed' }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  log({ msg: `order-context listening on :${PORT}` });
});
