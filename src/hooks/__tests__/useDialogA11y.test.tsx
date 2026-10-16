import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FOCUSABLE_SELECTOR,
  getFocusableElements,
  nextFocusIndex,
  resolveDialogKey,
  useDialogA11y,
} from '../useDialogA11y';
import type { UseDialogA11yOptions, UseDialogA11yResult } from '../useDialogA11y';

/**
 * O ambiente de teste do projeto é `node` (sem jsdom instalado), então os
 * testes cobrem (a) o HTML/ARIA que o diálogo emite, via render de servidor,
 * e (b) as decisões puras de teclado e de foco. O ciclo de vida do efeito
 * (trava de rolagem, `inert`, devolução de foco) precisa de DOM real e fica
 * para o E2E.
 */
let captured: UseDialogA11yResult | null = null;

function Probe(options: UseDialogA11yOptions) {
  captured = useDialogA11y(options);
  const { dialogProps, backdropProps, titleId } = captured;
  return (
    <div data-testid="dialogo" {...dialogProps}>
      <div data-testid="backdrop" {...backdropProps} />
      <h2 id={titleId}>Sua Sacola</h2>
      <button type="button">Fechar</button>
    </div>
  );
}

function renderProbe(options: Partial<UseDialogA11yOptions> = {}) {
  captured = null;
  const markup = renderToStaticMarkup(
    <Probe isOpen onClose={() => undefined} {...options} />
  );
  const result = captured as UseDialogA11yResult | null;
  if (!result) throw new Error('o hook não foi executado durante o render');
  return { markup, result };
}

describe('useDialogA11y — atributos do diálogo', () => {
  it('emite role, aria-modal, aria-labelledby e tabIndex no elemento raiz', () => {
    const { markup, result } = renderProbe();

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(result.dialogProps['aria-modal']).toBe(true);
    expect(result.dialogProps.tabIndex).toBe(-1);
    expect(result.dialogProps.role).toBe('dialog');
  });

  it('liga aria-labelledby a um elemento real do diálogo', () => {
    const { markup, result } = renderProbe();

    const labelledBy = /aria-labelledby="([^"]*)"/.exec(markup)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(labelledBy).toBe(result.titleId);
    expect(markup).toContain(`id="${labelledBy}"`);
  });

  it('gera id sem caracteres especiais de useId', () => {
    const { result } = renderProbe();
    expect(result.titleId).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('usa aria-label quando o diálogo não tem título visível', () => {
    const { markup, result } = renderProbe({ label: 'Galeria de fotos em tela cheia' });

    expect(markup).toContain('aria-label="Galeria de fotos em tela cheia"');
    expect(markup).not.toContain('aria-labelledby');
    expect(result.dialogProps['aria-label']).toBe('Galeria de fotos em tela cheia');
    expect(result.dialogProps['aria-labelledby']).toBeUndefined();
  });

  it('aceita alertdialog para confirmação destrutiva', () => {
    const { markup, result } = renderProbe({ role: 'alertdialog' });
    expect(markup).toContain('role="alertdialog"');
    expect(result.dialogProps.role).toBe('alertdialog');
  });

  it('omite aria-modal em diálogo não modal (chat flutuante)', () => {
    const { markup, result } = renderProbe({ isModal: false });
    expect(markup).not.toContain('aria-modal');
    expect(result.dialogProps['aria-modal']).toBeUndefined();
    expect(result.backdropProps.onClick).toBeUndefined();
  });

  it('marca o backdrop como decorativo', () => {
    const { markup, result } = renderProbe();
    expect(markup).toContain('aria-hidden="true"');
    expect(result.backdropProps['aria-hidden']).toBe(true);
    expect(typeof result.backdropProps.onClick).toBe('function');
  });

  it('desliga o fechamento por backdrop quando closeOnBackdrop é false', () => {
    const { result } = renderProbe({ closeOnBackdrop: false });
    expect(result.backdropProps.onClick).toBeUndefined();
  });
});

describe('useDialogA11y — teclado', () => {
  it('Escape fecha e cancela o evento padrão (evita duplo fechamento)', () => {
    let fechou = 0;
    const { result } = renderProbe({ onClose: () => (fechou += 1) });

    const event = {
      key: 'Escape',
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    const onKeyDown = result.dialogProps.onKeyDown as unknown as (
      e: typeof event
    ) => void;

    onKeyDown(event);
    expect(fechou).toBe(1);
    expect(event.defaultPrevented).toBe(true);

    // O listener de window vê o mesmo evento já tratado e não repete o fecho.
    expect(resolveDialogKey(event, true)).toBeNull();
  });

  it('Tab sem contêiner montado não lança erro nem prende o evento', () => {
    const { result } = renderProbe();
    const event = {
      key: 'Tab',
      defaultPrevented: false,
      shiftKey: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    const onKeyDown = result.dialogProps.onKeyDown as unknown as (
      e: typeof event
    ) => void;

    expect(() => onKeyDown(event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('resolveDialogKey', () => {
  it('mapeia as teclas para a ação esperada', () => {
    expect(resolveDialogKey({ key: 'Escape' }, true)).toBe('close');
    expect(resolveDialogKey({ key: 'Escape' }, false)).toBe('close');
    expect(resolveDialogKey({ key: 'Tab' }, true)).toBe('trap');
    expect(resolveDialogKey({ key: 'Tab' }, false)).toBeNull();
    expect(resolveDialogKey({ key: 'ArrowDown' }, true)).toBeNull();
    expect(resolveDialogKey({ key: 'a' }, true)).toBeNull();
  });

  it('ignora evento já tratado pelo handler do React', () => {
    expect(resolveDialogKey({ key: 'Escape', defaultPrevented: true }, true)).toBeNull();
    expect(resolveDialogKey({ key: 'Tab', defaultPrevented: true }, true)).toBeNull();
  });
});

describe('nextFocusIndex', () => {
  it('cicla para frente nas pontas', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 1, false)).toBe(2);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
  });

  it('cicla para trás nas pontas', () => {
    expect(nextFocusIndex(3, 2, true)).toBe(1);
    expect(nextFocusIndex(3, 1, true)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
  });

  it('entra pelo primeiro focável quando o foco está fora', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(3, 99, false)).toBe(0);
  });

  it('devolve -1 sem focáveis', () => {
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});

describe('getFocusableElements', () => {
  type FakeOptions = { visible?: boolean; ariaHidden?: boolean; inert?: boolean };

  const fakeFocusable = ({ visible = true, ariaHidden, inert }: FakeOptions = {}) =>
    ({
      getAttribute: (name: string) =>
        name === 'aria-hidden' && ariaHidden ? 'true' : null,
      hasAttribute: (name: string) => (name === 'inert' ? !!inert : false),
      getClientRects: () => (visible ? [{}] : []),
    }) as unknown as HTMLElement;

  const containerWith = (elements: HTMLElement[]) =>
    ({ querySelectorAll: () => elements }) as unknown as Element;

  it('mantém visíveis e descarta ocultos, ocultos para leitor de tela e inertes', () => {
    const visivel = fakeFocusable();
    const oculto = fakeFocusable({ visible: false });
    const escondido = fakeFocusable({ ariaHidden: true });
    const inerte = fakeFocusable({ inert: true });

    const result = getFocusableElements(containerWith([visivel, oculto, escondido, inerte]));
    expect(result).toEqual([visivel]);
  });

  it('seletor cobre links, campos e tabindex positivo, e exclui tabindex -1', () => {
    expect(FOCUSABLE_SELECTOR).toContain('a[href]');
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
