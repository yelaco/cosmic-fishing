/**
 * smoke.spec.mjs — Assertion functions for the Cosmic Fishing headless smoke test.
 * All logic lives in run-smoke.mjs; this file exports the assertion helpers
 * so the module exists as required and passes `node --check`.
 */

/**
 * Assert that the resource bar is present and shows "Gold: 0" on first paint.
 * AC-002: page loads within 3s; #resource-bar contains Gold with value 0.
 *
 * @param {import('playwright').Page} page
 */
export async function assertResourceBar(page) {
  // Wait for #resource-bar to be present in DOM (within 3s — DOMContentLoaded guarantee)
  await page.waitForSelector('#resource-bar', { timeout: 3000 });

  // Check the resource bar contains the text "Gold:" and "0"
  const barText = await page.$eval('#resource-bar', el => el.textContent);
  if (!barText.includes('Gold')) {
    throw new Error(`AC-002 FAIL: #resource-bar does not contain "Gold". Got: ${JSON.stringify(barText)}`);
  }
  if (!barText.includes('0')) {
    throw new Error(`AC-002 FAIL: #resource-bar does not show "0" for Gold. Got: ${JSON.stringify(barText)}`);
  }
}

/**
 * Assert that clicking Cast produces a .catch-result card within 10s.
 * AC-013: find .cast-btn, click it, wait for .catch-result to appear.
 *
 * @param {import('playwright').Page} page
 */
export async function assertCastAndCatch(page) {
  // Find the cast button
  const castBtn = await page.waitForSelector('.cast-btn', { timeout: 3000 });
  if (!castBtn) {
    throw new Error('AC-013 FAIL: .cast-btn not found in DOM');
  }

  await castBtn.click();

  // Wait up to 10s for a .catch-result to appear
  const catchResult = await page.waitForSelector('.catch-result', { timeout: 10000 });
  if (!catchResult) {
    throw new Error('AC-013 FAIL: .catch-result did not appear within 10s after clicking Cast');
  }
}

/**
 * Filter console errors — ignore intentional dream-sea instability warnings.
 * Returns only unexpected errors.
 *
 * @param {Array<{type: string, text: string}>} messages
 * @returns {Array<{type: string, text: string}>}
 */
export function filterUnexpectedErrors(messages) {
  return messages.filter(msg => {
    const text = msg.text.toLowerCase();
    // Ignore dream-sea-related intentional instability warnings
    if (text.includes('dream')) return false;
    return true;
  });
}
