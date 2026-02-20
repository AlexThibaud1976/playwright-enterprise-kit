/**
 * Playwright Enterprise Kit - Reporter BrowserStack personnalisé
 *
 * Affiche un résumé de l'exécution dans la console avec la configuration utilisée
 * et le lien vers le dashboard BrowserStack.
 */

class BrowserStackReporter {
  constructor() {
    this.results = [];
  }

  onBegin(_config, _suite) {
    const os = process.env.BS_OS || 'Windows';
    const osVersion = process.env.BS_OS_VERSION || '11';
    const browser = process.env.BS_BROWSER || 'chrome';
    const browserVersion = process.env.BS_BROWSER_VERSION || 'latest';
    const buildName = process.env.BROWSERSTACK_BUILD_NAME || 'Local';
    const workers = process.env.BS_WORKERS || '5';

    console.log('');
    console.log('='.repeat(60));
    console.log('  BrowserStack Execution');
    console.log('='.repeat(60));
    console.log(`  Build     : ${buildName}`);
    console.log(`  Config    : ${os} ${osVersion} - ${browser} ${browserVersion}`);
    console.log(`  Workers   : ${workers}`);
    console.log('='.repeat(60));
    console.log('');
  }

  onTestEnd(test, result) {
    const testName = test.titlePath().slice(1).join(' > ');
    const status = result.status === 'passed' ? 'PASS' : 'FAIL';
    const duration = `${(result.duration / 1000).toFixed(2)}s`;

    this.results.push({
      name: testName,
      status: result.status,
      duration: result.duration,
      error: result.error?.message,
    });

    const icon = result.status === 'passed' ? '+' : '-';
    console.log(`[${icon}] ${status} | ${duration} | ${testName}`);
  }

  async onEnd(result) {
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const total = this.results.length;
    const duration = `${(result.duration / 1000).toFixed(2)}s`;

    console.log('');
    console.log('='.repeat(60));
    console.log('  BrowserStack Summary');
    console.log('='.repeat(60));
    console.log(`  Total   : ${total}`);
    console.log(`  Passed  : ${passed}`);
    console.log(`  Failed  : ${failed}`);
    console.log(`  Skipped : ${skipped}`);
    console.log(`  Duration: ${duration}`);

    if (process.env.BROWSERSTACK_USERNAME) {
      console.log('');
      console.log('  Dashboard: https://automate.browserstack.com/dashboard/v2');
    }

    console.log('='.repeat(60));
    console.log('');
  }
}

module.exports = BrowserStackReporter;
