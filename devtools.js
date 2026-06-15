// Create the GA4 Debugger panel. All capture/render logic lives in panel.js,
// which has full access to browser.devtools.network from the panel context.
browser.devtools.panels.create('📶 GA4 Debugger', 'icons/icon-48.svg', 'panel.html');
