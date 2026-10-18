import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSessionSearch} from '../../apps/web/ui/session-search.js';

class Element extends EventTarget {
  constructor({id = '', interactive = false, row = false, parent = null} = {}) {
    super(); Object.assign(this, {id, interactive, row, parent, value: '', scrollTop: 0, hidden: false, attributes: {}, focused: 0, blurred: 0});
  }
  contains(node) { return node === this || !!node?.parent && this.contains(node.parent); }
  closest(selector) { return (selector === '.session-row' ? this.row : this.interactive) ? this : this.parent?.closest(selector); }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus(options) { this.focused++; this.focusOptions = options; }
  blur() { this.blurred++; }
}
function setup() {
  const surface = new Element(), scrollArea = new Element({parent: surface}), row = new Element({parent: scrollArea});
  const field = new Element({id: 'session-search-wrap'}), input = new Element({interactive: true}), toggle = new Element({interactive: true}), cancel = new Element({interactive: true}), queries = [];
  const controller = mountSessionSearch({surface, scrollArea, field, input, toggle, cancel, onQueryChange: query => queries.push(query)});
  return {surface, scrollArea, row, field, input, toggle, cancel, queries, controller};
}
function send(node, type, properties = {}) {
  const event = new Event(type, {cancelable: true});
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, {value});
  node.dispatchEvent(event); return event;
}
const touch = (x, y, identifier = 1) => ({clientX: x, clientY: y, identifier});
function pull(f, {target = f.row, dx = 0, dy = 60, cancelled = false} = {}) {
  send(f.surface, 'touchstart', {target, touches: [touch(50, 50)]});
  const movement = send(f.surface, 'touchmove', {touches: [touch(50 + dx, 50 + dy)]});
  send(f.surface, cancelled ? 'touchcancel' : 'touchend', {touches: []});
  return movement;
}

test('search starts hidden and its explicit button opens with focus without scrolling', () => {
  const f = setup(); assert.equal(f.field.hidden, true); assert.equal(f.toggle.attributes['aria-expanded'], 'false');
  assert.equal(f.toggle.attributes['aria-controls'], f.field.id);
  send(f.toggle, 'click'); assert.equal(f.field.hidden, false); assert.equal(f.toggle.attributes['aria-expanded'], 'true');
  assert.equal(f.input.focused, 1); assert.deepEqual(f.input.focusOptions, {preventScroll: true});
});
test('a deliberate downward pull at the list top reveals search without opening the keyboard or intercepting scroll', () => {
  const f = setup(), movement = pull(f); assert.equal(f.controller.isOpen, true); assert.equal(f.input.focused, 0); assert.equal(movement.defaultPrevented, false);
});
test('a normal scrolled list, short pull, upward movement and horizontal gesture do not open search', () => {
  for (const options of [{dy: 51}, {dy: -60}, {dx: 100, dy: 65}]) { const f = setup(); pull(f, options); assert.equal(f.field.hidden, true); }
  const f = setup(); f.scrollArea.scrollTop = 80; pull(f); assert.equal(f.field.hidden, true);
});
test('pulls on controls or outside the list do not open search', () => {
  const f = setup();
  for (const target of [new Element({parent: f.scrollArea, interactive: true}), new Element({parent: f.surface}), f.input]) {
    pull(f, {target}); assert.equal(f.controller.isOpen, false);
  }
});
test('cancelled touches and multitouch never open search', () => {
  const f = setup(); pull(f, {cancelled: true}); assert.equal(f.controller.isOpen, false);
  send(f.surface, 'touchstart', {target: f.row, touches: [touch(0, 0)]});
  send(f.surface, 'touchmove', {touches: [touch(0, 90), touch(10, 90, 2)]});
  send(f.surface, 'touchend', {touches: []}); assert.equal(f.controller.isOpen, false);
});
test('reversing a pull below threshold or entering a scroll does not accidentally reveal search', () => {
  const f = setup();
  send(f.surface, 'touchstart', {target: f.row, touches: [touch(0, 0)]});
  send(f.surface, 'touchmove', {touches: [touch(0, 80)]});
  send(f.surface, 'touchmove', {touches: [touch(0, 20)]});
  send(f.surface, 'touchend', {touches: []}); assert.equal(f.controller.isOpen, false);
  send(f.surface, 'touchstart', {target: f.row, touches: [touch(0, 0)]});
  f.scrollArea.scrollTop = 25;
  send(f.surface, 'touchmove', {touches: [touch(0, 80)]});
  f.scrollArea.scrollTop = 0;
  send(f.surface, 'touchend', {touches: []}); assert.equal(f.controller.isOpen, false);
});
test('cancel clears the active filter, hides the field and restores button focus', () => {
  const f = setup(); send(f.toggle, 'click'); f.input.value = '旅行'; send(f.input, 'input');
  send(f.cancel, 'click'); assert.deepEqual(f.queries, ['旅行', '']); assert.equal(f.input.value, ''); assert.equal(f.field.hidden, true);
  assert.equal(f.input.blurred, 1); assert.equal(f.toggle.focused, 1);
  f.controller.close(); assert.deepEqual(f.queries, ['旅行', '']);
});
test('Escape dismisses search, but does not interrupt input method composition', () => {
  const f = setup(); f.controller.open();
  send(f.surface, 'keydown', {key: 'Escape', isComposing: true}); assert.equal(f.controller.isOpen, true);
  const escape = send(f.surface, 'keydown', {key: 'Escape'}); assert.equal(f.controller.isOpen, false); assert.equal(escape.defaultPrevented, true);
});
test('destroy removes all handlers and makes controller actions inert', () => {
  const f = setup(); f.controller.destroy(); send(f.toggle, 'click'); pull(f); f.controller.open();
  f.input.value = 'ignored'; send(f.input, 'input'); assert.equal(f.controller.isOpen, false); assert.deepEqual(f.queries, []);
});
test('pulling a filled-list row reveals search and consumes only the compatibility click from that pull', () => {
  const f = setup(), row = new Element({parent: f.scrollArea, row: true, interactive: true}), label = new Element({parent: row});
  pull(f, {target: label}); assert.equal(f.controller.isOpen, true);
  let opened = 0;
  f.surface.addEventListener('click', () => opened++);
  const accidental = send(f.surface, 'click', {target: label, detail: 1});
  assert.equal(accidental.defaultPrevented, true); assert.equal(opened, 0);
  const next = send(f.surface, 'click', {target: label, detail: 1});
  assert.equal(next.defaultPrevented, false); assert.equal(opened, 1);
});
test('a fresh normal row tap after a pull is never blocked, even within the compatibility window', () => {
  const f = setup(), row = new Element({parent: f.scrollArea, row: true, interactive: true});
  pull(f, {target: row});
  send(f.surface, 'touchstart', {target: row, touches: [touch(0, 0)]});
  send(f.surface, 'touchend', {touches: []});
  assert.equal(send(f.surface, 'click', {target: row, detail: 1}).defaultPrevented, false);
});
test('normal row taps and nested row controls retain their ordinary behavior', () => {
  const f = setup(), row = new Element({parent: f.scrollArea, row: true, interactive: true}), menu = new Element({parent: row, interactive: true});
  pull(f, {target: row, dy: 4}); assert.equal(f.controller.isOpen, false);
  assert.equal(send(f.surface, 'click', {target: row, detail: 1}).defaultPrevented, false);
  pull(f, {target: menu}); assert.equal(f.controller.isOpen, false);
  assert.equal(send(f.surface, 'click', {target: menu, detail: 1}).defaultPrevented, false);
});
