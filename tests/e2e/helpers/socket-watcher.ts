// tests/e2e/helpers/socket-watcher.ts
import { Page } from '@playwright/test';

export async function waitForSocketEvent(
  page: Page,
  eventName: string,
  timeoutMs = 30000
): Promise<any> {
  return page.evaluate(
    ({ event, timeout }) => {
      return new Promise((resolve, reject) => {
        // Access the global Socket.io instance (exposed in dev mode)
        const socket = (window as any).__SOCKET__;
        if (!socket) {
          reject(new Error(`Socket not exposed on window.__SOCKET__`));
          return;
        }
        const timer = setTimeout(() => reject(new Error(`Socket event "${event}" timed out after ${timeout}ms`)), timeout);
        socket.once(event, (data: any) => {
          clearTimeout(timer);
          resolve(data);
        });
      });
    },
    { event: eventName, timeout: timeoutMs }
  );
}

export async function listenForSocketEvents(page: Page, events: string[]): Promise<void> {
  await page.evaluate((eventList) => {
    (window as any).__socketEvents = (window as any).__socketEvents || [];
    const socket = (window as any).__SOCKET__;
    if (!socket) return;
    eventList.forEach((ev: string) => {
      socket.on(ev, (data: any) => {
        (window as any).__socketEvents.push({ event: ev, data, ts: Date.now() });
      });
    });
  }, events);
}

export async function getCapturedEvents(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__socketEvents || []);
}
