import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

/**
 * Acessibilidade de diálogos — implementação única para os modais/drawers da loja.
 *
 * Uso (o componente monta o diálogo condicionalmente, então o hook vem ANTES do
 * `if (!isOpen) return null`):
 *
 * ```tsx
 * const { dialogProps, backdropProps, titleId } = useDialogA11y({ isOpen, onClose });
 *
 * if (!isOpen) return null;
 *
 * return (
 *   <div {...dialogProps} className="fixed inset-0 z-50 ...">
 *     <div {...backdropProps} onClick={onClose} className="absolute inset-0 bg-black/60 ..." />
 *     <h3 id={titleId}>Título do diálogo</h3>
 *   </div>
 * );
 * ```
 *
 * O que ele resolve (achados F01–F06 da auditoria em docs/A11Y.md):
 * - foco preso dentro do diálogo enquanto ele está aberto (Tab/Shift+Tab ciclam);
 * - `Escape` fecha, inclusive quando o foco escapou para fora;
 * - o foco volta ao gatilho que abriu, em vez de cair no `<body>`;
 * - o foco inicial entra no diálogo (primeiro focável, ou `initialFocusRef`);
 * - o fundo deixa de rolar atrás do diálogo (trava de `overflow` no `body`);
 * - `inert`/`aria-hidden` nos elementos de fora — defesa em profundidade contra
 *   a fuga de foco descrita na auditoria (§1.1).
 */

/** Elementos focáveis aceitos dentro de um diálogo. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Decisão de teclado do diálogo, isolada para teste puro. */
export type DialogKeyAction = 'close' | 'trap' | null;

/**
 * Devolve o que fazer com uma tecla pressionada:
 * - `close` → `Escape` fecha o diálogo;
 * - `trap` → `Tab` deve ser interceptado para ciclar dentro do diálogo;
 * - `null` → o navegador segue normalmente.
 *
 * Um evento já tratado (`defaultPrevented`) devolve `null`, para que o handler
 * global e o handler do React nunca rodem duas vezes para a mesma tecla.
 */
export function resolveDialogKey(
  event: { key?: string; defaultPrevented?: boolean },
  isModal: boolean
): DialogKeyAction {
  if (event.defaultPrevented) return null;
  if (event.key === 'Escape') return 'close';
  if (event.key === 'Tab' && isModal) return 'trap';
  return null;
}

/**
 * Índice do próximo focável numa lista que cicla nas pontas.
 * `currentIndex < 0` significa que o foco está fora da lista (ou no próprio
 * contêiner): entra no primeiro focável, ou no último com Shift.
 */
export function nextFocusIndex(count: number, currentIndex: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return shiftKey ? count - 1 : 0;
  if (shiftKey) return currentIndex === 0 ? count - 1 : currentIndex - 1;
  return currentIndex === count - 1 ? 0 : currentIndex + 1;
}

/** Focáveis visíveis do contêiner, na ordem do DOM. */
export function getFocusableElements(container: Element): HTMLElement[] {
  const found = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return found.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.hasAttribute('inert')) return false;
    if (typeof el.getClientRects !== 'function') return true;
    return el.getClientRects().length > 0;
  });
}

export interface UseDialogA11yOptions {
  /** Controla montagem, como o `isOpen` de hoje. */
  isOpen: boolean;
  /** Chamado pelo `Escape`, pelo backdrop (quando ligado) e pelo ✕ do diálogo. */
  onClose: () => void;
  /** Papel do diálogo. `alertdialog` para confirmações destrutivas. */
  role?: 'dialog' | 'alertdialog';
  /**
   * `false` para janelas não modais (chat flutuante): sem `aria-modal`, sem
   * trap, sem trava de rolagem, mas ainda com foco inicial e devolução.
   */
  isModal?: boolean;
  /** Fecha com clique no backdrop. Ignorado quando `isModal` é `false`. */
  closeOnBackdrop?: boolean;
  /** Elemento a focar ao abrir. Default: primeiro focável do diálogo. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Gatilho a receber o foco de volta. Prevalece sobre o elemento ativo guardado
   * na abertura — use quando o gatilho pode não ser o `activeElement` (botão
   * flutuante do chat, gatilho remontado junto com a janela).
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Devolve o foco ao gatilho ao fechar. Default: `true`. */
  returnFocus?: boolean;
  /** Rola o diálogo para a visão ao focá-lo. Default: `true`. */
  scrollIntoView?: boolean;
  /**
   * Nome acessível escrito direto no diálogo, para diálogos SEM título visível
   * (galeria de fotos, chat flutuante). Sem `label`, o nome sai do `titleId`
   * apontando para o `h2`/`h3` visível — o texto que a cliente vê é o nome mais
   * fiel, e o `grep` por `aria-labelledby` deixa de ser zero no projeto.
   */
  label?: string;
}

export interface UseDialogA11yResult {
  /** Aplicar no elemento raiz do diálogo (espalhar junto com o `className`). */
  dialogProps: {
    ref: (el: HTMLElement | null) => void;
    role: 'dialog' | 'alertdialog';
    'aria-modal': true | undefined;
    'aria-labelledby': string | undefined;
    'aria-label': string | undefined;
    tabIndex: -1;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  /** Aplicar no backdrop. */
  backdropProps: {
    onClick: (() => void) | undefined;
    'aria-hidden': true;
  };
  /** Id estável do título — colocar no `id` do `h2`/`h3` do diálogo. */
  titleId: string;
  /** Referência ao elemento raiz do diálogo. */
  containerRef: RefObject<HTMLElement | null>;
}

/* -------------------------------------------------------------------------
 * Trava de rolagem do body (com contador: dois diálogos empilhados não
 * devolvem o `overflow` no meio do caminho).
 * ---------------------------------------------------------------------- */

let scrollLocks = 0;
let savedBodyOverflow = '';

function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (scrollLocks === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || scrollLocks === 0) return;
  scrollLocks -= 1;
  if (scrollLocks === 0) document.body.style.overflow = savedBodyOverflow;
}

/* -------------------------------------------------------------------------
 * Elementos de fora do diálogo ficam inacessíveis enquanto ele está aberto.
 * ---------------------------------------------------------------------- */

type OutsideMark = {
  element: HTMLElement;
  inert: string | null;
  ariaHidden: string | null;
};

type InertableElement = HTMLElement & { inert?: boolean };

function hideOutside(container: HTMLElement): OutsideMark[] {
  const marks: OutsideMark[] = [];
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = container.parentElement;
  while (node) {
    chain.push(node);
    node = node.parentElement;
  }

  for (const parent of chain) {
    for (const rawChild of Array.from(parent.children)) {
      if (!(rawChild instanceof HTMLElement)) continue;
      if (rawChild === container || chain.indexOf(rawChild) !== -1) continue;
      marks.push({
        element: rawChild,
        inert: rawChild.getAttribute('inert'),
        ariaHidden: rawChild.getAttribute('aria-hidden'),
      });
      (rawChild as InertableElement).inert = true;
      if (rawChild.getAttribute('aria-hidden') === null) {
        rawChild.setAttribute('aria-hidden', 'true');
      }
    }
  }

  return marks;
}

function restoreOutside(marks: OutsideMark[]): void {
  for (const mark of marks) {
    const el = mark.element as InertableElement;
    if (mark.inert === null) el.inert = false;
    else el.setAttribute('inert', mark.inert);

    if (mark.ariaHidden === null) el.removeAttribute('aria-hidden');
    else el.setAttribute('aria-hidden', mark.ariaHidden);
  }
}

/* ------------------------------------------------------------------------- */

export function useDialogA11y(options: UseDialogA11yOptions): UseDialogA11yResult {
  const {
    isOpen,
    onClose,
    role = 'dialog',
    isModal = true,
    closeOnBackdrop = true,
    initialFocusRef,
    returnFocusRef,
    returnFocus = true,
    scrollIntoView = true,
    label,
  } = options;

  const containerRef = useRef<HTMLElement | null>(null);
  const titleId = useId().replace(/[^a-zA-Z0-9_-]/g, '') || 'dialogo-titulo';

  // Último `onClose` sem reexecutar o efeito de abertura: os consumidores
  // passam arrow functions novas a cada render, e reexecutar refocaria o
  // diálogo a cada renderização.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /**
   * Único caminho de teclado do diálogo: serve o `onKeyDown` do elemento raiz
   * (foco dentro) e o listener de `window` (foco que escapou). O
   * `resolveDialogKey` descarta o segundo quando o primeiro já tratou.
   */
  const handleKeyDown = (event: KeyboardEvent | ReactKeyboardEvent): void => {
    const action = resolveDialogKey(event, isModal);
    if (!action) return;

    if (action === 'close') {
      event.preventDefault();
      onCloseRef.current();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const focusables = getFocusableElements(container);
    if (focusables.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const active = document.activeElement;
    const activeIsInside = active instanceof Node && container.contains(active);
    const currentIndex =
      activeIsInside && active instanceof HTMLElement ? focusables.indexOf(active) : -1;

    event.preventDefault();
    const next = nextFocusIndex(focusables.length, currentIndex, !!event.shiftKey);
    if (next >= 0) focusables[next].focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyActive =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const outsideMarks = isModal ? hideOutside(container) : [];
    if (isModal) lockBodyScroll();

    const focusTarget =
      initialFocusRef?.current ?? getFocusableElements(container)[0] ?? container;
    focusTarget.focus({ preventScroll: !scrollIntoView });

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (isModal) {
        unlockBodyScroll();
        restoreOutside(outsideMarks);
      }
      if (!returnFocus) return;
      const target = returnFocusRef?.current ?? previouslyActive;
      if (target && target !== document.body && document.contains(target)) {
        target.focus({ preventScroll: true });
      }
    };
    // O efeito acompanha só a abertura: `onClose`/refs não podem reiniciar o
    // ciclo de foco no meio da sessão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const dialogProps: UseDialogA11yResult['dialogProps'] = {
    ref: (el: HTMLElement | null) => {
      containerRef.current = el;
    },
    role,
    'aria-modal': isModal ? true : undefined,
    'aria-labelledby': label ? undefined : titleId,
    'aria-label': label,
    tabIndex: -1,
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      handleKeyDown(event);
    },
  };

  const backdropProps: UseDialogA11yResult['backdropProps'] = {
    onClick: isModal && closeOnBackdrop ? () => onCloseRef.current() : undefined,
    'aria-hidden': true,
  };

  return { dialogProps, backdropProps, titleId, containerRef };
}
