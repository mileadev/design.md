import { chromium, type Browser, type BrowserContextOptions } from 'playwright';
import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<AbortSignal>();
export function withBrowserSignal<T>(signal: AbortSignal, task: () => T): T {
  return scope.run(signal, task);
}
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (!url.port || url.port === '443');
  } catch { return false; }
}
export async function launchSafeBrowser(): Promise<Browser> {
  const signal = scope.getStore();
  signal?.throwIfAborted();
  const server = process.env.DESIGNMD_EGRESS_PROXY;
  if (!server) throw new Error('Restricted egress proxy is required');
  const proxy = new URL(server);
  if (proxy.protocol !== 'http:' || proxy.username || proxy.password || !proxy.port ||
      proxy.pathname !== '/' || proxy.search || proxy.hash) throw new Error('Invalid egress proxy configuration');
  const browser = await chromium.launch({
    headless: true, chromiumSandbox: true, timeout: 15_000,
    proxy: { server: proxy.origin, bypass: '<-loopback>' },
    args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp' },
  });
  const stop = () => { void browser.close().catch(() => undefined); };
  const deadline = setTimeout(stop, 180_000);
  deadline.unref();
  signal?.addEventListener('abort', stop, { once: true });
  browser.once('disconnected', () => {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', stop);
  });
  if (signal?.aborted) { await browser.close(); signal.throwIfAborted(); }
  return browser;
}
export async function safeContext(browser: Browser, options: BrowserContextOptions = {}, offline = false) {
  const context = await browser.newContext({
    ...options, ignoreHTTPSErrors: false, serviceWorkers: 'block',
    acceptDownloads: false, permissions: [], javaScriptEnabled: !offline,
  });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);
  await context.route('**/*', async route => {
    const req = route.request();
    if (offline || !isHttpsUrl(req.url()) || !['GET', 'HEAD'].includes(req.method())) {
      await route.abort('blockedbyclient');
    } else { await route.continue(); }
  });
  await context.routeWebSocket('**/*', ws => ws.close());
  return context;
}
