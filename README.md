# Playwright Enterprise Kit

Framework Playwright enterprise-ready, prêt à l'emploi et distribuable à toutes les équipes.

**Inclus out-of-the-box :**
- Jira/Xray (upload des résultats, création automatique de Test Executions)
- BrowserStack (desktop + mobile, sélection dynamique OS/navigateur)
- Confluence (reporting historique automatique)
- GitHub Actions (workflow paramétré avec résumé visuel)
- TypeScript + POM (Page Object Model)
- Evidence automatique (screenshots attachés aux rapports Xray)

---

## Structure du projet

```
playwright-enterprise-kit/
├── .github/
│   └── workflows/
│       └── playwright.yml          # CI/CD paramétré (BrowserStack + Jira + Confluence)
├── pages/
│   └── base.page.ts               # Classe de base pour vos Page Objects
├── scripts/
│   ├── upload-xray.ps1             # Upload JUnit XML vers Xray Cloud
│   ├── jira-post-execution.ps1     # Enrichissement de la Test Execution Jira
│   ├── update-confluence-report.js # Mise à jour du dashboard Confluence
│   ├── resolve-browserstack-config.js  # Validation de la config BrowserStack
│   ├── get-browserstack-build-link.js  # Récupération du lien build BrowserStack
│   ├── add-timestamps-to-xray-report.js # Post-traitement du XML Xray
│   └── remove-test-keys.js         # Nettoyage des test_key orphelins
├── tests/
│   └── example/
│       ├── 01-sanity.spec.ts       # Test de sanité (health check)
│       └── 02-login.spec.ts        # Exemple avec POM
├── utils/
│   └── helpers.ts                  # Utilitaires génériques
├── browserstack.config.js          # Configuration centralisée BrowserStack
├── browserstack-fixtures.js        # Fixtures Playwright pour BrowserStack
├── browserstack-reporter.js        # Reporter BrowserStack personnalisé
├── playwright.config.ts            # Configuration Playwright principale
├── playwright.config.browserstack.js  # Configuration Playwright BrowserStack
├── test-fixtures.js                # Sélecteur auto de fixtures (local / BS)
├── tsconfig.json
├── package.json
├── .env.example                    # Template variables d'environnement
└── .env.browserstack.example       # Template config BrowserStack
```

---

## Démarrage rapide

### 1. Créer votre repo depuis ce template

Sur GitHub, cliquer sur **"Use this template"** → **"Create a new repository"**.

### 2. Cloner et installer

```bash
git clone https://github.com/yourorg/your-project-tests.git
cd your-project-tests
npm install
npx playwright install
```

### 3. Configurer l'environnement

```bash
cp .env.example .env
# Éditer .env avec vos valeurs (BASE_URL, JIRA_URL, tokens...)
```

### 4. Lancer les tests en local

```bash
npm test                    # Tous les tests (headless)
npm run test:headed         # Avec navigateur visible
npm run test:ui             # Mode interactif Playwright
npm run test:example        # Uniquement les tests d'exemple
```

### 5. Voir le rapport

```bash
npm run test:report
```

---

## Configuration Jira / Xray

### Prérequis

- Compte Jira Cloud avec Xray installé
- Un projet Jira existant (ex: `MYPROJECT`)
- Des credentials Xray Cloud (client_id + client_secret)

### Variables d'environnement

Dans `.env` :

```env
JIRA_URL=https://yourcompany.atlassian.net
JIRA_USER=your.email@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=MYPROJECT
XRAY_CLIENT_ID=your_xray_client_id
XRAY_CLIENT_SECRET=your_xray_client_secret
```

> Les tokens Jira API se créent sur : https://id.atlassian.com/manage-profile/security/api-tokens
> Les credentials Xray Cloud se créent dans : Xray → API Keys

### Lier un test à Jira

Dans un test, ajouter l'annotation `test_key` :

```typescript
test('User can login', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'test_key', value: 'MYPROJECT-42' });
  // ...
});
```

> Si le test n'a pas encore de test_key (test nouveau), ne pas ajouter l'annotation.
> Xray créera automatiquement un nouveau Test dans Jira.

### Workflow de test

1. Créer un **Test Plan** dans Jira (ex: `MYPROJECT-100`)
2. Déclencher le workflow GitHub Actions avec la clé du Test Plan
3. Xray crée automatiquement une **Test Execution** liée au Test Plan
4. La Test Execution est enrichie : titre, labels, champs personnalisés, rapport HTML, liens GitHub/BrowserStack

---

## Configuration BrowserStack

### Prérequis

- Compte BrowserStack Automate
- Credentials : `BROWSERSTACK_USERNAME` + `BROWSERSTACK_ACCESS_KEY`

### En local

```bash
cp .env.browserstack.example .env.browserstack
# Éditer .env.browserstack avec vos credentials
source .env.browserstack
npm run test:browserstack
```

### Via GitHub Actions (workflow_dispatch)

Paramètres disponibles lors du déclenchement manuel :

| Paramètre      | Description                           | Exemples                    |
|---------------|---------------------------------------|------------------------------|
| `issueKey`    | Clé du Test Plan Jira                 | `MYPROJECT-100`             |
| `os`          | Système d'exploitation                | `Windows`, `Mac`            |
| `osVersion`   | Version de l'OS                       | `11`, `Sonoma`, `Sequoia`   |
| `browser`     | Navigateur                            | `chrome`, `firefox`, `safari`, `edge` |
| `browserVersion` | Version du navigateur             | `latest`, `131`             |
| `testScope`   | Périmètre de test                     | `all`, `sanity`, `login`    |
| `confluenceReport` | Publier sur Confluence          | `true` / `false`            |

### Secrets GitHub Actions à configurer

Dans **Settings > Secrets and variables > Actions** :

**Jira/Xray (requis pour l'upload) :**
```
JIRA_URL
JIRA_USER
JIRA_API_TOKEN
XRAY_CLIENT_ID
XRAY_CLIENT_SECRET
```

**BrowserStack (requis pour les tests distants) :**
```
BROWSERSTACK_USERNAME
BROWSERSTACK_ACCESS_KEY
```

**Confluence (optionnel) :**
```
CONFLUENCE_URL          # ex: https://yourco.atlassian.net/wiki
CONFLUENCE_USER
CONFLUENCE_API_TOKEN
CONFLUENCE_SPACE_KEY    # ex: QA
CONFLUENCE_PAGE_TITLE   # ex: Test Execution Dashboard
CONFLUENCE_PARENT_PAGE_ID  # optionnel
```

**Champs personnalisés Jira (optionnel) :**
```
JIRA_CUSTOM_FIELD_OS
JIRA_CUSTOM_FIELD_OS_VERSION
JIRA_CUSTOM_FIELD_BROWSER
JIRA_CUSTOM_FIELD_BROWSER_VERSION
JIRA_CUSTOM_FIELD_TEST_SCOPE
```

> Pour récupérer les IDs des champs personnalisés Jira, appeler :
> `GET https://yourco.atlassian.net/rest/api/3/field`

---

## Ajouter vos propres tests

### 1. Créer une Page Object

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

### 2. Écrire les tests

```typescript
// tests/auth/login.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { captureEvidence } from '../../utils/helpers';

test.describe('Login', () => {
  test('User can login with valid credentials', async ({ page }, testInfo) => {
    // Lier à Jira (optionnel)
    testInfo.annotations.push({ type: 'test_key', value: 'MYPROJECT-1' });

    const loginPage = new LoginPage(page);
    await loginPage.login('user@example.com', 'password');

    await captureEvidence(page, testInfo, 'after-login');
    await expect(page).toHaveURL('/dashboard');
  });
});
```

### 3. Ajouter le scope au workflow

Dans `.github/workflows/playwright.yml`, ajouter le scope dans les deux sections :

```yaml
# Dans workflow_dispatch.inputs.testScope.options :
          - login

# Dans l'étape "Determine test pattern" :
            "login")
              echo "pattern=tests/auth/login.spec.ts" >> $GITHUB_OUTPUT
              echo "description=Login Tests" >> $GITHUB_OUTPUT
              ;;
```

---

## Reporting

### Rapport Playwright (HTML)

Généré automatiquement après chaque exécution dans `playwright-report/`.

```bash
npm run test:report
```

### Rapport GitHub Actions

Un résumé visuel est affiché dans l'onglet **Summary** du job GitHub Actions (via `@estruyf/github-actions-reporter`).

### Rapport Jira/Xray

Chaque exécution crée une **Test Execution** dans Jira avec :
- Titre : `[PASS/FAIL] Test Execution - <scope> - <device>`
- Labels : nom du device + résultat (PASS/FAIL)
- Champs personnalisés : OS, browser, version, scope
- Pièce jointe : rapport HTML Playwright
- Liens : GitHub Actions + BrowserStack

### Dashboard Confluence (optionnel)

Activer `confluenceReport: true` lors du déclenchement du workflow.
La page Confluence est créée automatiquement si elle n'existe pas, et mise à jour avec une nouvelle ligne à chaque exécution.

Colonnes : Date | Résultat | Scope | OS | Navigateur | Test Execution Jira | GitHub | BrowserStack

---

## Adapter le framework à votre projet

### Étapes minimales

1. **`playwright.config.ts`** : ajuster `workers`, `retries`, `projects` (navigateurs)
2. **`package.json`** : mettre à jour `name`, `description`, `author`
3. **`.github/workflows/playwright.yml`** : changer `JIRA_PROJECT_KEY`, ajouter vos scopes
4. **`browserstack.config.js`** : changer `projectName`
5. **`.env.example`** : adapter `BASE_URL`, `JIRA_PROJECT_KEY`
6. **Tests** : remplacer `tests/example/` par vos vrais tests

### Recommandations

- Organiser les tests par fonctionnalité : `tests/auth/`, `tests/checkout/`, `tests/catalog/`
- Créer une Page Object par page/composant : `pages/login.page.ts`, `pages/header.page.ts`
- Utiliser `generateUserData()` pour les données de test dynamiques
- Utiliser `captureEvidence()` pour les screenshots attachés à Xray
- Ne jamais committer `.env` ou `.env.browserstack` (déjà dans `.gitignore`)

---

## Support

Pour toute question ou contribution, ouvrir une issue sur le repository.
