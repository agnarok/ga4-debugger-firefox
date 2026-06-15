// Capture GA4/analytics requests via webRequest. Unlike devtools.network, this
// reliably surfaces navigator.sendBeacon() hits (which is how GA4 sends events)
// and gives us the request body directly.

const COLLECT_RE = /\/(g\/collect|mp\/collect|j\/collect|r\/collect|collect|batch)(\?|$)/i;

// Per-tab state
const panelPorts = new Map();   // tabId -> panel port
const reqBuffers = new Map();    // tabId -> {url, body}[] buffered before panel connects
const testModeOn = new Set();    // tabIds with test mode enabled

// ── Body decoding ──────────────────────────────────────────────────────────

function decodeBody(requestBody) {
  if (!requestBody) return '';

  if (requestBody.raw && requestBody.raw.length) {
    const decoder = new TextDecoder('utf-8');
    return requestBody.raw
      .map(chunk => (chunk.bytes ? decoder.decode(chunk.bytes) : ''))
      .join('');
  }

  if (requestBody.formData) {
    return Object.entries(requestBody.formData)
      .flatMap(([k, vals]) => vals.map(v => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`))
      .join('&');
  }

  return '';
}

// ── Capture ────────────────────────────────────────────────────────────────

browser.webRequest.onBeforeRequest.addListener(
  details => {
    if (details.tabId < 0) return;             // ignore non-tab requests
    if (!COLLECT_RE.test(details.url)) return;  // only analytics collection endpoints

    const payload = { url: details.url, body: decodeBody(details.requestBody) };
    const port = panelPorts.get(details.tabId);

    if (port) {
      port.postMessage({ type: 'request', ...payload });
    } else {
      if (!reqBuffers.has(details.tabId)) reqBuffers.set(details.tabId, []);
      const buf = reqBuffers.get(details.tabId);
      buf.push(payload);
      if (buf.length > 500) buf.shift();  // cap buffer
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

// ── Test mode: block GA4/analytics hits so production data stays clean ───────

browser.webRequest.onBeforeRequest.addListener(
  details => {
    if (details.tabId < 0) return {};
    if (!testModeOn.has(details.tabId)) return {};
    if (!COLLECT_RE.test(details.url)) return {};
    return { cancel: true };
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// ── Panel connection / control ───────────────────────────────────────────────

browser.runtime.onConnect.addListener(port => {
  if (port.name !== 'ga4-panel') return;
  let tabId;

  port.onMessage.addListener(msg => {
    if (msg.type === 'ready') {
      tabId = msg.tabId;
      panelPorts.set(tabId, port);

      // Flush buffered requests captured before the panel opened
      const buffered = reqBuffers.get(tabId);
      if (buffered && buffered.length) {
        buffered.forEach(p => port.postMessage({ type: 'request', ...p }));
        reqBuffers.delete(tabId);
      }

    } else if (msg.type === 'setTestMode') {
      if (msg.enabled) testModeOn.add(msg.tabId);
      else testModeOn.delete(msg.tabId);
    }
  });

  port.onDisconnect.addListener(() => {
    if (tabId !== undefined) panelPorts.delete(tabId);
  });
});

browser.tabs.onRemoved.addListener(tabId => {
  panelPorts.delete(tabId);
  reqBuffers.delete(tabId);
  testModeOn.delete(tabId);
});
