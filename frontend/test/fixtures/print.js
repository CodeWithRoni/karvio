import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

// Keep the real print document available for assertions. Headless Chromium can
// finish native printing before Playwright reads it, firing afterprint immediately.
export const test = base.extend({
  interceptPrint: [async ({ page }, use) => {
    await page.addInitScript(() => {
      const prototype = HTMLIFrameElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'contentWindow');
      Object.defineProperty(prototype, 'contentWindow', {
        ...descriptor,
        get() {
          const frameWindow = descriptor.get.call(this);
          if (frameWindow && this.style.position === 'fixed' && this.style.width === '0px') {
            frameWindow.print = () => { this.dataset.printInvoked = 'true'; };
          }
          return frameWindow;
        },
      });
    });
    await use();
  }, { auto: true }],
});
