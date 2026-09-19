const { chromium } = require('playwright');

async function startBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  };

  // Allow override for serverless / custom Chrome installs
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  try {
    const browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    return { browser, context };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/Executable doesn'?t exist|browserType\.launch/i.test(msg)) {
      const help =
        'Playwright Chromium browser is missing. Run this once in the project root:\n' +
        '  npx playwright install chromium\n' +
        'Or: npm run playwright:install\n' +
        'If you are on a serverless platform (Lambda/Vercel/etc), browsers must be installed at build time or use a Lambda-compatible Chromium package.';
      const enhanced = new Error(`${msg}\n\n${help}`);
      enhanced.original = err;
      throw enhanced;
    }
    throw err;
  }
}

module.exports = { startBrowser };
