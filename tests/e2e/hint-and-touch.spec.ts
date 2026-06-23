import { chromium, expect, test, type Page } from '@playwright/test';

async function enableHint(page: Page) {
  await page.locator('#btn-settings').click();
  await page.locator('#setting-hint').check({ force: true });
  await page.locator('#btn-close-settings').click();
  await expect(page.locator('#btn-hint')).toBeVisible();
}

async function stubWallHint(page: Page, isH = true) {
  await page.addInitScript(({ horizontal }) => {
    class StubWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;

      postMessage(message: { id: number }) {
        setTimeout(() => {
          this.onmessage?.({
            data: { id: message.id, action: { type: 'wall', isH: horizontal, r: 2, c: 2 } },
          } as MessageEvent);
        }, 0);
      }

      terminate() {}
    }

    window.Worker = StubWorker as unknown as typeof Worker;
  }, { horizontal: isH });
}

async function dispatchWallMouse(page: Page, x: number, y: number) {
  await page.locator('#board').evaluate((board, point) => {
    const rect = board.getBoundingClientRect();
    const clientX = rect.left + point.x * rect.width / 562;
    const clientY = rect.top + point.y * rect.height / 562;

    board.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX,
      clientY,
    }));
    board.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX,
      clientY,
    }));
  }, { x, y });
}

async function dispatchWallTouch(page: Page, x: number, y: number) {
  await page.locator('#board').evaluate((board, point) => {
    const rect = board.getBoundingClientRect();
    const clientX = rect.left + point.x * rect.width / 562;
    const clientY = rect.top + point.y * rect.height / 562;
    const touch = new Touch({
      identifier: 1,
      target: board,
      clientX,
      clientY,
    });

    board.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch],
    }));
    board.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [touch],
    }));
  }, { x, y });
}

test('hint wall stays non-blocking and clears after any legal wall placement', async ({ page }) => {
  await stubWallHint(page);
  await page.goto('/');
  await enableHint(page);

  await page.locator('#btn-hint').click();
  await expect(page.locator('#active-hint-wall')).toBeVisible();
  await expect(page.locator('#active-hint-wall')).toHaveCSS('pointer-events', 'none');

  await dispatchWallMouse(page, 57, 57);

  await expect(page.locator('#active-hint-wall')).toHaveCount(0);
  await expect(page.locator('.wall.new-drop.owner-1')).toHaveCount(1);
});

test('clicking the green hint area does not force the hinted wall location', async ({ page }) => {
  await stubWallHint(page);
  await page.goto('/');
  await enableHint(page);

  await page.locator('#btn-hint').click();
  await expect(page.locator('#active-hint-wall')).toBeVisible();

  await dispatchWallMouse(page, 57, 57);

  await expect(page.locator('.wall.new-drop.owner-1')).toHaveAttribute('style', /top: 50px; left: 0px;/);
});

test('mobile touch can preview, rotate, and place a wall', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Touchscreen API is only available in Chromium here');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto('/');

  await dispatchWallTouch(page, 57, 57);
  await expect(page.locator('#btn-touch-rotate')).toBeVisible();
  await page.locator('#btn-touch-rotate').click();
  await dispatchWallTouch(page, 57, 57);

  await expect(page.locator('.wall.new-drop.owner-1')).toHaveCount(1);
  await context.close();
  await browser.close();
});
