const isServerless =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.AWS_EXECUTION_ENV ||
  (!!process.env.NOW_REGION && process.env.NODE_ENV === 'production');

// Render / Railway / Fly / local → full Playwright Chromium
const useSparticuz =
  process.env.PLAYWRIGHT_USE_SPARTICUZ === '1' ||
  (isServerless && process.env.PLAYWRIGHT_USE_SPARTICUZ !== '0');

async function startBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };

  // Extra flags only for tight serverless sandboxes
  if (useSparticuz || isServerless) {
    launchOptions.args.push('--single-process', '--no-zygote');
  }

  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  let chromium;
  try {
    if (useSparticuz) {
      const sparticuz = require('@sparticuz/chromium');
      const { chromium: pwChromium } = require('playwright-core');
      chromium = pwChromium;
      launchOptions.executablePath = await sparticuz.executablePath();
      launchOptions.args = [
        ...sparticuz.args,
        ...launchOptions.args.filter((a) => !sparticuz.args.includes(a)),
      ];
    } else {
      // Render, local, Railway, etc.
      try {
        const pw = require('playwright');
        chromium = pw.chromium;
      } catch {
        const { chromium: pwChromium } = require('playwright-core');
        chromium = pwChromium;
      }
    }
  } catch (reqErr) {
    throw new Error(
      'Playwright is not available. On Render/local run: npm install && npx playwright install chromium\n' +
        String(reqErr && reqErr.message ? reqErr.message : reqErr)
    );
  }

  try {
    const browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    });

    return { browser, context };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/Executable doesn'?t exist|browserType\.launch|Failed to launch/i.test(msg)) {
      const help =
        'Playwright Chromium browser is missing.\n' +
        'On Render: set build command to:\n' +
        '  npm install && npx playwright install-deps chromium && npx playwright install chromium\n' +
        'Locally: npx playwright install chromium';
      const enhanced = new Error(`${msg}\n\n${help}`);
      enhanced.original = err;
      throw enhanced;
    }
    throw err;
  }
}

module.exports = { startBrowser, isServerless };
