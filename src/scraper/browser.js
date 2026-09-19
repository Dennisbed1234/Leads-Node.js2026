const isServerless =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.AWS_EXECUTION_ENV ||
  process.env.NODE_ENV === 'production' && !!process.env.NOW_REGION;

async function startBrowser() {
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process', // often needed on serverless
      '--no-zygote',
    ],
  };

  // Explicit override always wins
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  let chromium;
  try {
    if (isServerless || process.env.PLAYWRIGHT_USE_SPARTICUZ === '1') {
      // Serverless-friendly Chromium (Vercel / Lambda)
      const sparticuz = require('@sparticuz/chromium');
      const { chromium: pwChromium } = require('playwright-core');
      chromium = pwChromium;
      launchOptions.executablePath = await sparticuz.executablePath();
      launchOptions.args = [...sparticuz.args, ...launchOptions.args.filter(a => !sparticuz.args.includes(a))];
      // Sparticuz defaults already include many of the needed flags
    } else {
      // Local / traditional install
      const pw = require('playwright');
      chromium = pw.chromium;
    }
  } catch (reqErr) {
    // Fallback if packages missing
    try {
      const pw = require('playwright');
      chromium = pw.chromium;
    } catch {
      throw new Error(
        'Neither playwright nor playwright-core + @sparticuz/chromium is available. ' +
          'Run: npm install playwright   or   npm install playwright-core @sparticuz/chromium'
      );
    }
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
        'Playwright Chromium browser is missing or incompatible with this environment.\n' +
        'Local fix:\n' +
        '  npx playwright install chromium\n' +
        '  or: npm run playwright:install\n\n' +
        'Serverless (Vercel/Lambda):\n' +
        '  Ensure @sparticuz/chromium and playwright-core are installed.\n' +
        '  The browser binary is provided by @sparticuz/chromium at runtime.\n' +
        '  Do NOT run "playwright install" on Vercel (it is skipped automatically).';
      const enhanced = new Error(`${msg}\n\n${help}`);
      enhanced.original = err;
      throw enhanced;
    }
    throw err;
  }
}

module.exports = { startBrowser, isServerless };
