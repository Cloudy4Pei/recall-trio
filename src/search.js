// 原文检索 deep_recall：找某件具体的事（“她说背疼那次”）。
// 关键词 + 向量两路各取前 30，用 RRF 合并，再交给重排模型排序，取前几段并带上前后文。
import { searchTerms, dayStart, stamp } from './text.js';
import { withDefaults } from './config.js';

// ctx：
//   chunks   prepareChunks() 处理过的段
//   embed    async (texts: string[]) => number[][]        可选；没有就只走关键词
//   rerank   async (query, documents: string[]) => [{index, score}]   可选；没有就用合并顺序
export async function searchChunks({ query, keywords = [], from, to, limit }, ctx) {
  const o = withDefaults(ctx.options);
  const lo = from ? dayStart(from, o.timeZone) : '', hi = to ? dayStart(to, o.timeZone, 1) : '￿';
  const pool = ctx.chunks.filter(c => c.started_at >= lo && c.started_at < hi);
  if (!pool.length) return [];
  const ranks = new Map(), bump = list => list.forEach((it, i) => ranks.set(it, (ranks.get(it) || 0) + 1 / (60 + i)));

  // 关键词：命中的词越少见，分越高（简化的 IDF）。
  const terms = searchTerms(query, keywords);
  if (terms.length) {
    const df = terms.map(t => pool.reduce((n, c) => n + (c.lower.includes(t) ? 1 : 0), 0));
    const scored = pool.map(it => ({ it, s: terms.reduce((s, t, k) => s + (df[k] && it.lower.includes(t) ? Math.log(1 + pool.length / df[k]) : 0), 0) }))
      .filter(x => x.s > 0);
    bump(scored.sort((a, b) => b.s - a.s).slice(0, o.search.candidates).map(x => x.it));
  }
  // 向量：余弦相似度。
  if (ctx.embed && pool.some(c => c.vector)) {
    const [raw] = await ctx.embed([[query, ...keywords].join(' ').slice(0, 500)]);
    const q = Float32Array.from(raw); let qn = 0; for (const x of q) qn += x * x; qn = Math.sqrt(qn) || 1;
    const scored = pool.filter(c => c.vector && c.vector.length === q.length).map(it => {
      let d = 0; for (let k = 0; k < q.length; k++) d += q[k] * it.vector[k];
      return { it, s: d / (qn * it.norm) };
    });
    bump(scored.sort((a, b) => b.s - a.s).slice(0, o.search.candidates).map(x => x.it));
  }
  let candidates = [...ranks].sort((a, b) => b[1] - a[1]).slice(0, o.search.rerankTop).map(([it]) => it);
  if (ctx.rerank && candidates.length > 1) {
    try {
      const results = await ctx.rerank([query, ...keywords].join(' '), candidates.map(c => c.label + ' ' + stamp(c.started_at, o.timeZone) + '\n' + c.text));
      const order = results.filter(r => r.index >= 0 && r.index < candidates.length).sort((a, b) => b.score - a.score);
      const best = order[0]?.score || 0;
      // 重排分太低的多半无关；但至少留两段，让模型自己判断。
      candidates = order.filter((r, i) => i < 2 || r.score >= Math.max(0.02, best * 0.15)).map(r => candidates[r.index]);
    } catch { /* 重排失败就用合并顺序 */ }
  }
  return candidates.slice(0, limit ?? o.search.limit);
}

// 输出：每段标时间和来源，前后各带同一线程里紧挨着的两行（隔太久的不带）。
export function formatHits(hits, options) {
  const o = withDefaults(options), gap = o.chunk.gapHours * 3600 * 1000;
  const edge = (chunk, which) => { const lines = chunk.text.split('\n'); return (which === 'tail' ? lines.slice(-2) : lines.slice(0, 2)).join('\n'); };
  return hits.map((h, i) => {
    const before = h.prev && Date.parse(h.started_at) - Date.parse(h.prev.ended_at) < gap ? edge(h.prev, 'tail') : '';
    const after = h.next && Date.parse(h.next.started_at) - Date.parse(h.ended_at) < gap ? edge(h.next, 'head') : '';
    return `[对话原文 #${i + 1} · ${stamp(h.started_at, o.timeZone)} · ${h.label}]\n`
      + (before ? '（前文）' + before.replaceAll('\n', '\n（前文）') + '\n' : '')
      + h.text
      + (after ? '\n（后文）' + after.replaceAll('\n', '\n（后文）') : '');
  }).join('\n\n');
}

// 工具入口。ctx.memories（可选）：async (query) => [{ title?, memory }]，有长期记忆库的话附在前面。
export async function deepRecall(args, ctx) {
  const [hits, memories] = await Promise.all([
    searchChunks(args, ctx),
    ctx.memories ? ctx.memories(args.query).then(list => list.slice(0, 3)).catch(() => []) : [],
  ]);
  const parts = [];
  if (memories.length) parts.push('[记忆碎片]\n' + memories.map(m => `  - ${m.title ? '[' + m.title + '] ' : ''}${m.memory}`).join('\n'));
  if (hits.length) parts.push(formatHits(hits, ctx.options));
  const range = args.from || args.to ? `（${args.from || '最早'} 至 ${args.to || '现在'}）` : '';
  return parts.length ? parts.join('\n\n') : `没有找到相关的原文${range}。可以换个说法，或提供原话里可能出现的词。`;
}
