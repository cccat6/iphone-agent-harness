const INTERACTIVE = 'input,textarea,select,button,a,[contenteditable="true"],[role="button"]';

// Search is secondary to browsing conversations. A deliberate pull reveals it
// without opening the keyboard; the explicit button also supports keyboard use.
export function mountSessionSearch({surface, scrollArea, field, input, toggle, cancel, onQueryChange = () => {}}) {
  if (![surface, scrollArea, field, input, toggle, cancel].every(Boolean)) {
    throw new TypeError('Session search requires its surface, list, field and controls');
  }
  let expanded = false, disposed = false, gesture = null, consumedPull = null;
  const listeners = [];
  function listen(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    listeners.push(() => node.removeEventListener(type, handler, options));
  }
  function sync() {
    field.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    if (field.id) toggle.setAttribute('aria-controls', field.id);
  }
  function open({focus = false} = {}) {
    if (disposed) return;
    expanded = true;
    gesture = null;
    sync();
    if (focus) input.focus({preventScroll: true});
  }
  function close({restoreFocus = false} = {}) {
    if (disposed) return;
    gesture = null;
    input.blur();
    const hadQuery = input.value !== '';
    input.value = '';
    expanded = false;
    sync();
    if (hadQuery) onQueryChange('');
    if (restoreFocus) toggle.focus({preventScroll: true});
  }
  listen(toggle, 'click', () => open({focus: true}));
  listen(cancel, 'click', () => close({restoreFocus: true}));
  listen(input, 'input', () => onQueryChange(input.value));
  listen(surface, 'keydown', event => {
    if (event.key === 'Escape' && expanded && !event.isComposing) {
      event.preventDefault();
      close({restoreFocus: true});
    }
  });
  listen(surface, 'touchstart', event => {
    gesture = null;
    // A fresh contact belongs to a new action, not the click from the last pull.
    consumedPull = null;
    if (expanded || event.touches.length !== 1 || scrollArea.scrollTop > 1) return;
    const target = event.target;
    if (!scrollArea.contains(target)) return;
    const row = target.closest?.('.session-row');
    const control = target.closest?.(INTERACTIVE);
    if (control && control !== row) return;
    const touch = event.touches[0];
    gesture = {id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0, row};
  }, {passive: true});
  listen(surface, 'touchmove', event => {
    if (!gesture) return;
    const touch = event.touches.length === 1 && event.touches[0];
    if (!touch || touch.identifier !== gesture.id || scrollArea.scrollTop > 1) { gesture = null; return; }
    const dx = Math.abs(touch.clientX - gesture.x), dy = touch.clientY - gesture.y;
    if (dy < -8 || (dx > 24 && dx > dy * .75)) { gesture = null; return; }
    gesture.distance = dy;
  }, {passive: true});
  listen(surface, 'touchend', event => {
    const finished = gesture;
    gesture = null;
    if (!finished || event.touches.length || scrollArea.scrollTop > 1) return;
    if (finished.distance >= 52) {
      open();
      if (finished.row) consumedPull = {row: finished.row, expires: Date.now() + 600};
    }
  }, {passive: true});
  listen(surface, 'touchcancel', () => { gesture = null; }, {passive: true});
  listen(surface, 'click', event => {
    const consumed = consumedPull;
    if (!consumed || event.detail === 0) return;
    consumedPull = null;
    if (Date.now() > consumed.expires || !consumed.row.contains(event.target)) return;
    // Safari may dispatch a compatibility click after a completed touch gesture.
    // Consume only this row's one click; a subsequent touch always clears this.
    event.preventDefault();
    event.stopImmediatePropagation();
  }, {capture: true});
  sync();
  return {
    open,
    close,
    get isOpen() { return expanded; },
    destroy() { disposed = true; gesture = null; consumedPull = null; for (const remove of listeners) remove(); }
  };
}
