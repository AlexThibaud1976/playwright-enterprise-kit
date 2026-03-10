# Playwright Enterprise Kit

Enterprise-ready Playwright framework, ready to use and distributable across all teams.

**Included out-of-the-box:**
- Jira/Xray (results upload, automatic Test Execution creation)
- BrowserStack (desktop + mobile, dynamic OS/browser selection)
- Confluence (automatic historical reporting)
- GitHub Actions (parameterized workflow with visual summary)
- TypeScript + POM (Page Object Model)
- Automatic evidence (screenshots attached to Xray reports)

---

## Project structure

```
playwright-enterprise-kit/
├── .github/
│   └── workflows/
│       └── playwright.yml          # Parameterized CI/CD (BrowserStack + Jira + Confluence)
├── pages/
│   └── base.page.ts               # Base class for your Page Objects
├── scripts/
│   ├── upload-xray.ps1             # Upload JUnit XML to Xray Cloud
│   ├── jira-post-execution.ps1     # Enrich the Jira Test Execution
│   ├── update-confluence-report.js # Update Confluence dashboard
│   ├── resolve-browserstack-config.js  # Validate BrowserStack configuration
│   ├── get-browserstack-build-link.js  # Retrieve BrowserStack build link
│   ├── add-timestamps-to-xray-report.js # Post-process Xray XML report
│   └── remove-test-keys.js         # Remove orphan test_keys
├── tests/
│   └── example/
│       ├── 01-sanity.spec.ts       # Sanity test (health check)
│       └── 02-login.spec.ts        # Example with POM
├── utils/
│   └── helpers.ts                  # Generic utilities
├── browserstack.config.js          # Centralized BrowserStack configuration
├── browserstack-fixtures.js        # Playwright fixtures for BrowserStack
├── browserstack-reporter.js        # Custom BrowserStack reporter
├── playwright.config.ts            # Main Playwright configuration
├── playwright.config.browserstack.js  # BrowserStack Playwright configuration
├── test-fixtures.js                # Auto fixture selector (local / BS)
├── tsconfig.json
├── package.json
├── .env.example                    # Environment variables template
└── .env.browserstack.example       # BrowserStack configuration template
```

---

## Quick start

### 1. Create your repo from this template

On GitHub, click **"Use this template"** → **"Create a new repository"**.

### 2. Clone and install

```bash
git clone https://github.com/yourorg/your-project-tests.git
cd your-project-tests
npm install
npx playwright install
```

### 3. Configure the environment

```bash
cp .env.example .env
# Edit .env with your values (BASE_URL, JIRA_URL, tokens...)
```

### 4. Run tests locally

```bash
npm test                    # All tests (headless)
npm run test:headed         # With visible browser
npm run test:ui             # Playwright interactive mode
npm run test:example        # Example tests only
```

### 5. View the report

```bash
npm run test:report
```

---

## Jira / Xray configuration

### Prerequisites

- Jira Cloud account with Xray installed
- An existing Jira project (e.g. `MYPROJECT`)
- Xray Cloud credentials (client_id + client_secret)

### Environment variables

In `.env`:

```env
JIRA_URL=https://yourcompany.atlassian.net
JIRA_USER=your.email@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=MYPROJECT
XRAY_CLIENT_ID=your_xray_client_id
XRAY_CLIENT_SECRET=your_xray_client_secret
```

> Jira API tokens can be created at: https://id.atlassian.com/manage-profile/security/api-tokens
> Xray Cloud credentials are created in: Xray → API Keys

### Linking a test to Jira

In a test, add the `test_key` annotation:

```typescript
test('User can login', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'test_key', value: 'MYPROJECT-42' });
  // ...
});
```

> If the test does not yet have a test_key (new test), do not add the annotation.
> Xray will automatically create a new Test in Jira.

### Test workflow

1. Create a **Test Plan** in Jira (e.g. `MYPROJECT-100`)
2. Trigger the GitHub Actions workflow with the Test Plan key
3. Xray automatically creates a **Test Execution** linked to the Test Plan
4. The Test Execution is enriched: title, labels, custom fields, HTML report, GitHub/BrowserStack links

---

## BrowserStack configuration

### Prerequisites

- BrowserStack Automate account
- Credentials: `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`

### Locally

```bash
cp .env.browserstack.example .env.browserstack
# Edit .env.browserstack with your credentials
source .env.browserstack
npm run test:browserstack
```

### Via GitHub Actions (workflow_dispatch)

Parameters available when triggering manually:

| Parameter      | Description                           | Examples                    |
|---------------|---------------------------------------|------------------------------|
| `issueKey`    | Jira Test Plan key                    | `MYPROJECT-100`             |
| `os`          | Operating system                      | `Windows`, `Mac`            |
| `osVersion`   | OS version                            | `11`, `Sonoma`, `Sequoia`   |
| `browser`     | Browser                               | `chrome`, `firefox`, `safari`, `edge` |
| `browserVersion` | Browser version                   | `latest`, `131`             |
| `testScope`   | Test scope                            | `all`, `sanity`, `login`    |
| `confluenceReport` | Publish to Confluence          | `true` / `false`            |

### GitHub Actions secrets to configure

In **Settings > Secrets and variables > Actions**:

**Jira/Xray (required for upload):**
```
JIRA_URL
JIRA_USER
JIRA_API_TOKEN
XRAY_CLIENT_ID
XRAY_CLIENT_SECRET
```

**BrowserStack (required for remote tests):**
```
BROWSERSTACK_USERNAME
BROWSERSTACK_ACCESS_KEY
```

**Confluence (optional):**
```
CONFLUENCE_URL          # e.g. https://yourco.atlassian.net/wiki
CONFLUENCE_USER
CONFLUENCE_API_TOKEN
CONFLUENCE_SPACE_KEY    # e.g. QA
CONFLUENCE_PAGE_TITLE   # e.g. Test Execution Dashboard
CONFLUENCE_PARENT_PAGE_ID  # optional
```

**Jira custom fields (optional):**
```
JIRA_CUSTOM_FIELD_OS
JIRA_CUSTOM_FIELD_OS_VERSION
JIRA_CUSTOM_FIELD_BROWSER
JIRA_CUSTOM_FIELD_BROWSER_VERSION
JIRA_CUSTOM_FIELD_TEST_SCOPE
```

> To retrieve Jira custom field IDs, call:
> `GET https://yourco.atlassian.net/rest/api/3/field`

---

## Adding your own tests

### 1. Create a Page Object

```typescript
// pages/login.page.ts
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly emailInput = this.page.locator('input[name="email"]');
  readonly passwordInput = this.page.locator('input[name="password"]');
  readonly submitButton = this.page.locator('button[type="submit"]');

  async login(email: string, password: string) {
    await this.navigate('/login');
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}
```

### 2. Write the tests

```typescript
// tests/auth/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { captureEvidence } from '../../utils/helpers';

test.describe('Login', () => {
  test('User can login with valid credentials', async ({ page }, testInfo) => {
    // Link to Jira (optional)
    testInfo.annotations.push({ type: 'test_key', value: 'MYPROJECT-1' });

    const loginPage = new LoginPage(page);
    await loginPage.login('user@example.com', 'password');

    await captureEvidence(page, testInfo, 'after-login');
    await expect(page).toHaveURL('/dashboard');
  });
});
```

### 3. Add the scope to the workflow

In `.github/workflows/playwright.yml`, add the scope in both sections:

```yaml
# In workflow_dispatch.inputs.testScope.options:
          - login

# In the "Determine test pattern" step:
            "login")
              echo "pattern=tests/auth/login.spec.ts" >> $GITHUB_OUTPUT
              echo "description=Login Tests" >> $GITHUB_OUTPUT
              ;;
```

---

## Reporting

### Playwright report (HTML)

Generated automatically after each run in `playwright-report/`.

```bash
npm run test:report
```

### GitHub Actions report

A visual summary is displayed in the **Summary** tab of the GitHub Actions job (via `@estruyf/github-actions-reporter`).

### Jira/Xray report

Each run creates a **Test Execution** in Jira with:
- Title: `[PASS/FAIL] Test Execution - <scope> - <device>`
- Labels: device name + result (PASS/FAIL)
- Custom fields: OS, browser, version, scope
- Attachment: Playwright HTML report
- Links: GitHub Actions + BrowserStack

### Confluence dashboard (optional)

Enable `confluenceReport: true` when triggering the workflow.
The Confluence page is created automatically if it does not exist, and updated with a new row after each run.

Columns: Date | Result | Scope | OS | Browser | Jira Test Execution | GitHub | BrowserStack

---

## Adapting the framework to your project

### Minimum steps

1. **`playwright.config.ts`**: adjust `workers`, `retries`, `projects` (browsers)
2. **`package.json`**: update `name`, `description`, `author`
3. **`.github/workflows/playwright.yml`**: change `JIRA_PROJECT_KEY`, add your scopes
4. **`browserstack.config.js`**: change `projectName`
5. **`.env.example`**: adapt `BASE_URL`, `JIRA_PROJECT_KEY`
6. **Tests**: replace `tests/example/` with your actual tests

### Recommendations

- Organize tests by feature: `tests/auth/`, `tests/checkout/`, `tests/catalog/`
- Create one Page Object per page/component: `pages/login.page.ts`, `pages/header.page.ts`
- Use `generateUserData()` for dynamic test data
- Use `captureEvidence()` for screenshots attached to Xray
- Never commit `.env` or `.env.browserstack` (already in `.gitignore`)

---

## Support

For any question or contribution, open an issue on the repository.
