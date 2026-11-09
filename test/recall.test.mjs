import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildChunks, prepareChunks, appendToThread, cleanText, dayStart, runRecallTool, surveyLines, isoWeek, TOOL_DEFINITIONS } from '../src/index.js';
import { toyEmbed, toyChat } from '../examples/toy-models.js';

const options = { names: { user: '小满', ai: '阿澈' } };
const messages = fs.readFileSync(new URL('../examples/sample-chat.jsonl', import.meta.url), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const chunks = buildChunks(messages, options);
(await toyEmbed(chunks.map(c => c.text))).forEach((v, i) => { chunks[i].vector = v; });
const ctx = { options, chunks: prepareChunks(chunks), embed: toyEmbed, chat: toyChat };

test('cleaning keeps only what was said', () => {
  assert.equal(cleanText('<think>想想</think>好呀\n【当前时间】下午三点\n\n晚安'), '好呀 晚安');
  assert.equal(cleanText('第一行\n第二行', { keepLines: true }), '第一行\n第二行');
});

test('chunks follow the thread: at most six lines, a new one after a long gap', () => {
  assert.ok(chunks.every(c => c.text.split('\n').length <= 6));
  const t = (h, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m)).toISOString();
  const out = appendToThread({ thread: 'x', label: 'x', options, messages: [
    { ref: 1, role: 'user', time: t(1), text: '早' }, { ref: 2, role: 'assistant', time: t(1, 1), text: '早呀' },
    { ref: 3, role: 'user', time: t(9), text: '晚上好' }] });
  assert.deepEqual(out.map(c => c.text), ['小满：早\n阿澈：早呀', '小满：晚上好']);
  // 续写：上一段没满就续进去，向量清空等着重算。
  const more = appendToThread({ thread: 'x', label: 'x', options, last: { ...out[1], id: 7, vector: [1] }, messages: [{ ref: 4, role: 'assistant', time: t(9, 2), text: '晚上好' }] });
  assert.equal(more.length, 1); assert.equal(more[0].id, 7); assert.equal(more[0].vector, null);
  assert.equal(more[0].text, '小满：晚上好\n阿澈：晚上好');
});

test('day boundaries follow the configured time zone', () => {
  assert.equal(dayStart('2026-10-02', 'Asia/Shanghai'), '2026-10-01T16:00:00.000Z');
  assert.equal(dayStart('2026-10-02', 'UTC', 1), '2026-10-03T00:00:00.000Z');
  assert.equal(dayStart('2026-07-01', 'America/New_York'), '2026-07-01T04:00:00.000Z');
  assert.deepEqual(isoWeek('2026-10-02'), { year: 2026, week: 40 });
});

test('deep_recall finds the moment with time, label and context', async () => {
  const out = await runRecallTool('deep_recall', { query: '背疼', keywords: ['背疼', '箱子'] }, ctx);
  assert.match(out, /^\[对话原文 #1 · 2026-09-03 \d\d:\d\d · 日常\][\s\S]*晚上背疼/);
  const none = await runRecallTool('deep_recall', { query: '背疼', from: '2026-10-01', to: '2026-10-01' }, ctx);
  assert.doesNotMatch(none, /背疼，可能/);
  // 没有向量模型也能用关键词检索。
  const plain = await runRecallTool('deep_recall', { query: '糖醋排骨' }, { ...ctx, embed: null });
  assert.match(plain, /糖醋排骨/);
});

test('recall_survey filters lines, then lets the model pick', async () => {
  const lines = surveyLines({ questions_only: true }, ctx);
  assert.ok(lines.length >= 5 && lines.every(l => l.speaker === '小满'));
  const out = await runRecallTool('recall_survey', { criterion: '最可爱的问题', questions_only: true }, ctx);
  assert.match(out, /以下都是原话[\s\S]*1\. \[2026-09-03 [^\]]+\] 小满：你说猫为什么/);
  assert.match(await runRecallTool('recall_survey', { criterion: 'x', keywords: ['不存在的词'] }, ctx), /没有筛到/);
});

test('recall_timeline drills from month to day to raw pages, with or without a calendar', async () => {
  const month = await runRecallTool('recall_timeline', { when: '2026-10' }, ctx);
  assert.match(month, /【2026年10月】[\s\S]*- 2026-10-02（原文 1 段）/);
  const calendar = async period => period === 'day' ? [{ date: '2026-10-02', label: '10月2日', content: '看到海了' }] : [];
  assert.match(await runRecallTool('recall_timeline', { when: '2026-10-02' }, { ...ctx, calendar }), /日总结（10月2日）：看到海了[\s\S]*1 页原文/);
  assert.match(await runRecallTool('recall_timeline', { when: '2026-10-02', view: 'raw' }, ctx), /第 1\/1 页[\s\S]*小满：天晴了/);
  assert.match(await runRecallTool('recall_timeline', { when: '十月' }, ctx), /when 需要是/);
});

test('tool definitions are valid function schemas', () => {
  assert.deepEqual(TOOL_DEFINITIONS.map(t => t.function.name), ['deep_recall', 'recall_survey', 'recall_timeline']);
  for (const t of TOOL_DEFINITIONS) assert.equal(t.function.parameters.type, 'object');
});
