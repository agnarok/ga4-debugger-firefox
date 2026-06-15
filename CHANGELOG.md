# Changelog

## 1.0.0 — Initial release

GA4 Debugger adds a **📶 GA4 Debugger** panel to Firefox DevTools that captures
and displays Google Analytics 4 events in real time.

### Features
- Real-time capture of GA4 Measurement Protocol hits (including `navigator.sendBeacon` requests)
- Multi-column event breakdown: **Event · User · Session · Settings · Platform**
- Event-type filters (Custom, Pageview, Automatic, Ecommerce, Recommended) and event-name search
- **Debug Mode** — routes events to GA4 Admin → DebugView
- **Test Mode** — blocks GA4 requests so production analytics data stays clean during testing
- Copy any event's raw payload as JSON

### Notes
- No data is collected, stored, or transmitted — all event data is parsed and displayed
  locally in the DevTools panel (`data_collection_permissions: ["none"]`).
