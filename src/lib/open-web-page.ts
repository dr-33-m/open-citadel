import * as WebBrowser from 'expo-web-browser';

/**
 * Opens a web page in the system's in-app browser (Custom Tabs, Safari View
 * Controller), so checking a source is a sheet over the chat and Back returns
 * to it, rather than a trip out to another app.
 *
 * http(s) only: a model writes the addresses these come from.
 */
export function openWebPage(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  void WebBrowser.openBrowserAsync(url).catch(() => {});
}
