# GA4 Debugger for Firefox

A DevTools extension that captures and displays Google Analytics 4 events in a dedicated panel. Port of the Chrome "Debugger for Google Analytics 4" extension.

Load via `about:debugging` → Load Temporary Add-on → `manifest.json`.

## Features

- Multi-column event breakdown
- Event-type filters
- Debug Mode
- Test Mode

## Development / Loading

1. Open Firefox and navigate to `about:debugging`.
2. Click **This Firefox** in the sidebar.
3. Click **Load Temporary Add-on…**.
4. Select the `manifest.json` file from this directory.
5. Open DevTools (F12) on any page and switch to the GA4 Debugger panel.

The add-on is loaded temporarily and will be removed when Firefox restarts. Reload it the same way after making changes.
