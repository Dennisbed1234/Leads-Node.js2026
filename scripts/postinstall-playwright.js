/**
 * Install Playwright Chromium after npm install.
 * Skipped on Vercel / AWS Lambda (use @sparticuz/chromium there).
 * Runs on Render, Railway, local, etc.
 */
const { execSync } = require('child_process');

const skip =
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.AWS_EXECUTION_ENV ||
  process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1';

if (skip) {
  console.log('[postinstall] Skipping Playwright browser download (serverless / skip flag).');
  process.exit(0);
}

try {
  console.log('[postinstall] Installing Playwright Chromium…');
  execSync('npx playwright install chromium', { stdio: 'inherit' });
  console.log('[postinstall] Chromium ready.');
} catch (err) {
  console.warn('[postinstall] Playwright install failed (non-fatal):', err.message);
  console.warn('Run manually: npx playwright install chromium');
  // Do not fail the whole npm install
  process.exit(0);
}
