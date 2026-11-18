import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {renderMessageMarkdown, usesMessageMarkdown} from '../../apps/web/ui/message-markdown.js';

test('conversation Markdown renders blocks, inline formatting, and GFM tables', () => {
  const source = [
    '## Results', '', 'Use **bold**, *emphasis*, ~~strikethrough~~ and `code`.', 'Second line.', '',
    '- first', '  - nested', '', '3. ordered', '', '> a quote', '',
    '| Name | State |', '| --- | --- |', '| Bridge | Connected |', '',
    '```html', '<p>Keep code literal</p>', '```',
  ].join('\n');
  const html = renderMessageMarkdown(source, {role:'assistant'});
  for (const fragment of [
    '<h2>Results</h2>', '<strong>bold</strong>', '<em>emphasis</em>', '<del>strikethrough</del>',
    '<code>code</code>', '<br>Second line.', '<ul>', '<li>nested</li>', '<ol start="3">',
    '<blockquote>', '<div class="markdown-table"><table>', '<th>State</th>',
    '<pre><code class="language-html">&lt;p&gt;Keep code literal&lt;/p&gt;',
  ]) assert.ok(html.includes(fragment), fragment);
});

test('conversation Markdown treats HTML as text and only creates approved links', () => {
  const html = renderMessageMarkdown([
    '<img src="https://example.test/html.png" onerror="run()">', '',
    '![description](https://example.test/markdown.png)',
    '[invalid](javascript:alert%281%29) [local](/same-origin) [data](data:text/plain,hello)',
    '[**Open**](https://example.test/?x=1&y=2 \'tag "title"\')',
  ].join('\n'));
  assert.match(html, /&lt;img src=&quot;/);
  assert.match(html, /description/);
  assert.doesNotMatch(html, /<img|markdown\.png|href="(?:javascript:|data:|\/)/);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.match(html, /href="https:\/\/example\.test\/\?x=1&amp;y=2" title="tag &quot;title&quot;" target="_blank" rel="noopener noreferrer"><strong>Open<\/strong><\/a>/);
  assert.equal(usesMessageMarkdown({role:'assistant'}), true);
  assert.equal(usesMessageMarkdown({role:'user'}), true);
  assert.equal(usesMessageMarkdown({role:'tool'}), false);
  assert.equal(usesMessageMarkdown({role:'assistant',internal:true}), false);
});

test('streamed Markdown coalesces deltas and drops queued rendering after completion', async () => {
  const source = await readFile(new URL('../../apps/web/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function onHarnessEvent(');
  const end = source.indexOf('async function resumeRun(', start);
  const state = {pending:null};
  const frames = [];
  const body = {innerHTML:''};
  let scrolls = 0;
  const context = vm.createContext({
    state, renderMessageMarkdown, $:() => body,
    requestAnimationFrame:callback => frames.push(callback),
    conversationFollow:() => ({afterRender(){ scrolls++; }}),
  });
  vm.runInContext(source.slice(start, end), context);
  context.onHarnessEvent({type:'delta',text:'**par'});
  context.onHarnessEvent({type:'delta',text:'tial**'});
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(body.innerHTML.trim(), '<p><strong>partial</strong></p>');
  assert.equal(scrolls, 1);
  context.onHarnessEvent({type:'delta',text:' trailing'});
  state.pending = null;
  frames.shift()();
  assert.doesNotMatch(body.innerHTML, /trailing/);
  assert.equal(scrolls, 1);
});
