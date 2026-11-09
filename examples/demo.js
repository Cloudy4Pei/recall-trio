// 不连任何 API 的演示：用虚构聊天建索引，跑一遍三个工具。
//   node examples/demo.js
// 向量和聊天模型都用玩具版代替（toy-models.js）；真接 API 见 openai-compatible.js。
import fs from 'node:fs';
import { buildChunks, prepareChunks, runRecallTool } from '../src/index.js';
import { toyEmbed, toyChat } from './toy-models.js';

const options = { names: { user: '小满', ai: '阿澈' } };
const messages = fs.readFileSync(new URL('./sample-chat.jsonl', import.meta.url), 'utf8').trim().split('\n').map(l => JSON.parse(l));

// 1. 切段，算向量（真项目里存进数据库，增量更新）。
const chunks = buildChunks(messages, options);
const vectors = await toyEmbed(chunks.map(c => c.text));
chunks.forEach((c, i) => { c.vector = vectors[i]; });

// 2. 组装 ctx，三个工具共用。
const ctx = {
  options,
  chunks: prepareChunks(chunks),
  embed: toyEmbed,
  chat: toyChat,
  calendar: async period => period === 'day'
    ? [{ date: '2026-10-02', label: '10月2日', content: '国庆第二天放晴，终于看到了海，还聊了月亮为什么不会掉下来。' }]
    : period === 'month' ? [{ date: '2026-10', label: '2026年10月', content: '国庆去厦门看海，月底论文被打回重写。' }] : [],
  progress: text => console.error('  ·', text),
};

for (const [name, args] of [
  ['deep_recall', { query: '那次背疼是怎么回事', keywords: ['背疼'] }],
  ['recall_survey', { criterion: '最可爱的问题', questions_only: true }],
  ['recall_timeline', { when: '2026-10' }],
  ['recall_timeline', { when: '2026-10-02', view: 'raw' }],
]) {
  console.log(`\n===== ${name} ${JSON.stringify(args)} =====\n`);
  console.log(await runRecallTool(name, args, ctx));
}
