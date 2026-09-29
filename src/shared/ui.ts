/** Small, framework-free UI helpers shared by the configurators. */

export interface Choice {
  value: string;
  label: string;
  /** CSS background for a colour/material swatch. Omit for a text chip. */
  swatch?: string;
  note?: string;
  disabled?: boolean;
}

export interface ChoiceGroup {
  id: string;
  label: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Renders a radio group styled as swatches or chips. Returns an updater so callers
 * can refresh the choices (e.g. finishes change when the material changes).
 */
export function choiceGroup(host: HTMLElement, group: ChoiceGroup) {
  const field = document.createElement('fieldset');
  field.className = 'group';
  field.id = `group-${group.id}`;
  host.append(field);

  let current = group;
  const render = () => {
    const selected = current.choices.find((c) => c.value === current.value);
    field.innerHTML = `
      <legend><span>${current.label}</span><em>${selected?.label ?? ''}</em></legend>
      <div class="choices ${current.choices.some((c) => c.swatch) ? 'is-swatches' : 'is-chips'}"></div>`;
    const list = field.querySelector('.choices')!;
    for (const c of current.choices) {
      const id = `${current.id}-${c.value}`;
      const label = document.createElement('label');
      label.className = 'choice';
      label.htmlFor = id;
      label.title = c.note ? `${c.label} · ${c.note}` : c.label;
      label.innerHTML = `
        <input type="radio" id="${id}" name="${current.id}" value="${c.value}" ${c.value === current.value ? 'checked' : ''} ${c.disabled ? 'disabled' : ''} />
        ${c.swatch ? `<span class="swatch" style="background:${c.swatch}"></span><span class="sr">${c.label}</span>` : `<span class="chip">${c.label}${c.note ? `<small>${c.note}</small>` : ''}</span>`}`;
      list.append(label);
    }
  };
  field.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value;
    current = { ...current, value };
    render();
    field.querySelector<HTMLInputElement>(`input[value="${CSS.escape(value)}"]`)?.focus();
    current.onChange(value);
  });
  render();

  return {
    el: field,
    update(next: Partial<ChoiceGroup>) {
      current = { ...current, ...next };
      render();
    },
  };
}

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

/** Shareable links: the configuration lives in the query string. */
export function readState<T extends Record<string, string>>(defaults: T, allowed: Partial<Record<keyof T, string[]>>): T {
  const params = new URLSearchParams(location.search);
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const v = params.get(key);
    if (v === null) continue;
    const ok = allowed[key];
    if (!ok || ok.includes(v)) out[key] = v.slice(0, 60) as T[typeof key];
  }
  return out;
}

export function writeState(state: Record<string, string>) {
  const params = new URLSearchParams(state);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

/** Fires `fn` at most once per animation frame (for text inputs driving textures). */
export function rafThrottle<A extends unknown[]>(fn: (...args: A) => void) {
  let queued = false;
  let last: A;
  return (...args: A) => {
    last = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...last);
    });
  };
}
