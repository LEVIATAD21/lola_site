import { defineConfig, devices } from '@playwright/test';

/**
 * A suíte roda contra o servidor de desenvolvimento já de pé em 127.0.0.1:3000.
 * `reuseExistingServer` impede que o Playwright tente subir outro processo: a
 * máquina roda vários trabalhos em paralelo e um segundo servidor disputaria a
 * porta 3000.
 *
 * `workers: 1` também não é casual: as cenas compartilham os limites de
 * requisição por minuto do servidor (pré-pedido e rastreamento), e paralelizar
 * transformaria isso em falso negativo.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
