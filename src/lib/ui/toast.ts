export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastItem extends Required<Pick<ToastOptions, 'variant' | 'duration'>> {
  id: string;
  title: string;
  description?: string;
  action?: ToastOptions['action'];
  createdAt: number;
}

const TOAST_EVENT = 'rd:toast';
const TOAST_DISMISS_EVENT = 'rd:toast:dismiss';
const DEFAULT_DURATION = 4200;

function uid(): string {
  return 't-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function show(options: ToastOptions): string {
  const id = uid();
  const toast: ToastItem = {
    id,
    title: options.title ?? 'Notificación',
    description: options.description,
    variant: options.variant ?? 'info',
    duration: options.duration ?? DEFAULT_DURATION,
    action: options.action,
    createdAt: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: toast }));
  return id;
}

function dismiss(id: string): void {
  window.dispatchEvent(new CustomEvent(TOAST_DISMISS_EVENT, { detail: { id } }));
}

const toast = {
  show,
  dismiss,
  success: (title: string, description?: string, opts?: Partial<ToastOptions>) =>
    show({ title, description, variant: 'success', ...opts }),
  error: (title: string, description?: string, opts?: Partial<ToastOptions>) =>
    show({ title, description, variant: 'error', ...opts }),
  warning: (title: string, description?: string, opts?: Partial<ToastOptions>) =>
    show({ title, description, variant: 'warning', ...opts }),
  info: (title: string, description?: string, opts?: Partial<ToastOptions>) =>
    show({ title, description, variant: 'info', ...opts }),
};

export { toast, TOAST_EVENT, TOAST_DISMISS_EVENT, DEFAULT_DURATION };

declare global {
  interface Window {
    RD: { toast: typeof toast } & Record<string, unknown>;
  }
}

if (typeof window !== 'undefined') {
  if (!window.RD) window.RD = {} as Window['RD'];
  window.RD.toast = toast;
}
