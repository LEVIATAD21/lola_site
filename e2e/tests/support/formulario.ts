import type { Locator, Page } from '@playwright/test';

/**
 * Campo do formulário de entrega.
 *
 * A tela de checkout já mudou uma vez a forma de identificar os campos
 * (placeholder → rótulo associado). A cena aceita as duas formas para não
 * quebrar quando essa superfície mudar de novo.
 */
export function campo(page: Page, rotulo: RegExp, placeholderOriginal: string): Locator {
  return page
    .getByLabel(rotulo)
    .or(page.getByPlaceholder(placeholderOriginal, { exact: true }))
    .first();
}
