// 翻旧账 recall_survey：「我问过最蠢的问题」「你说过最肉麻的一句」这类问题不是检索——
// 没有哪段原文和“蠢”语义相似，必须把一段历史全过一遍再评选。
// 流程：按说话人 / 日期 / 关键词 / 是否问句筛出单句原话 → 每 300 句一批交给模型初选（4 批并行）→ 候选多了再排一次序。
import { dayStart, stamp } from './text.js';
import { withDefaults } from './config.js';

const QUESTION = /[?？]|吗|呢|怎么|为什么|为啥|什么|是不是|会不会|能不能|要不要|哪|多少|几/;

// 从段里拆出单句。每句带上一句（同一段里的前一行，或紧挨着的上一段最后一行）。
export function surveyLines({ speaker = 'user', from, to, keywords = [], questions_only = false }, ctx) {
  const o = withDefaults(ctx.options), gap = o.chunk.gapHours * 3600 * 1000;
  const lo = from ? dayStart(from, o.timeZone) : '', hi = to ? dayStart(to, o.timeZone, 1) : '￿';
  const who = speaker === 'user' ? [o.names.user] : speaker === 'assistant' ? [o.names.ai] : [o.names.user, o.names.ai];
  const words = keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean);
  const out = [];
  for (const chunk of ctx.chunks) {
    if (chunk.started_at < lo || chunk.started_at >= hi) continue;
    const lines = chunk.text.split('\n');
    lines.forEach((line, i) => {
      const at = line.indexOf('：'), name = line.slice(0, at), text = line.slice(at + 1).trim();
      if (at < 0 || !who.includes(name) || text.replace(/\[图片\]/g, '').trim().length < 4) return;
      if (words.length && !words.some(w => text.toLowerCase().includes(w))) return;
      if (questions_only && !QUESTION.test(text)) return;
      const before = i > 0 ? lines[i - 1] : chunk.prev && Date.parse(chunk.started_at) - Date.parse(chunk.prev.ended_at) < gap ? chunk.prev.text.split('\n').at(-1) : '';
      out.push({ speaker: name, text, before, time: chunk.started_at, label: chunk.label });
    });
  }
  return out;
}

function parseJson(content) {
  const m = String(content || '').replace(/<(think|thinking)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

// ctx.chat：async (messages, { maxTokens }) => string   任意聊天模型；便宜的摘要模型就够用。
// ctx.progress（可选）：(text) => void   用来在界面上显示「正在翻旧账… 3/12 批」。
export async function surveyRecall(args, ctx) {
  const o = withDefaults(ctx.options), s = o.survey, progress = ctx.progress || (() => {});
  const who = sp => sp === 'user' ? `${o.names.user}（她）` : sp === 'assistant' ? `${o.names.ai}（你）` : `${o.names.user}和${o.names.ai}`;
  const ask = async (system, user, maxTokens) => parseJson(await ctx.chat([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens }));
  const speaker = args.speaker || 'user';
  const criterion = String(args.criterion || '').trim().slice(0, 200);
  const lines = surveyLines(args, ctx), range = args.from || args.to ? `${args.from || '最早'} 至 ${args.to || '现在'}` : '全部历史';
  if (!lines.length) return `按这些条件（${range}）没有筛到${who(speaker)}的话，可以放宽日期、去掉关键词或问句限制。`;
  if (lines.length > s.maxLines) return `符合条件的原话有 ${lines.length} 条，超过一次能翻完的 ${s.maxLines} 条。请限定日期范围、加关键词或只看问句后再试。`;

  const system = `你在帮忙翻聊天旧账。下面是${who(speaker)}在聊天里说过的话，每行以编号开头。评选标准：「${criterion}」。
从中挑出最符合标准的至多 3 条；宁缺毋滥，只是沾边的不要选，没有就返回空数组。
只输出 JSON：{"picks":[{"id":编号,"why":"不超过20字的理由"}]}`;
  const batches = []; for (let i = 0; i < lines.length; i += s.batch) batches.push(i);
  const picks = []; let done = 0, failed = 0;
  const run = async start => {
    const body = lines.slice(start, start + s.batch).map((l, k) => `#${start + k} ${speaker === 'both' ? l.speaker + '：' : ''}${l.text.slice(0, s.lineChars)}`).join('\n');
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) result = await ask(system, body, 400).catch(() => null);
    if (!Array.isArray(result?.picks)) failed++;
    else for (const p of result.picks.slice(0, 3)) {
      const id = Number(p?.id);
      if (Number.isInteger(id) && id >= start && id < start + s.batch && id < lines.length) picks.push({ id, why: String(p.why || '').slice(0, 40) });
    }
    progress(`正在翻旧账… ${++done}/${batches.length} 批`);
  };
  for (let i = 0; i < batches.length; i += s.parallel) await Promise.all(batches.slice(i, i + s.parallel).map(run));
  if (failed > batches.length / 2) throw new Error('翻旧账时一半以上的批次没有完成，请稍后重试');

  let ranked = [...new Map(picks.map(p => [p.id, p])).values()];
  if (ranked.length > s.final) {
    progress('正在汇总候选…');
    const body = ranked.map(p => `#${p.id} ${lines[p.id].text.slice(0, s.lineChars)}（初选理由：${p.why}）`).join('\n');
    const result = await ask(`下面是按「${criterion}」从聊天记录里初选出的候选原话。按符合程度从高到低排出最好的 ${s.final} 条。只输出 JSON：{"ranked":[编号,...]}`, body, 300).catch(() => null);
    const order = Array.isArray(result?.ranked) ? result.ranked.map(Number).filter(id => ranked.some(p => p.id === id)) : [];
    ranked = [...new Set(order)].map(id => ranked.find(p => p.id === id)).concat(ranked.filter(p => !order.includes(p.id))).slice(0, s.final);
  }
  if (!ranked.length) return `翻完了 ${lines.length} 条${who(speaker)}的话（${range}），没有特别符合「${criterion}」的。`;
  const items = ranked.map((p, i) => {
    const l = lines[p.id];
    return `${i + 1}. [${stamp(l.time, o.timeZone)} · ${l.label}] ${l.speaker}：${l.text}${l.before ? `\n   上一句 ${l.before}` : ''}${p.why ? `\n   初选理由：${p.why}` : ''}`;
  });
  return `按「${criterion}」翻了 ${lines.length} 条${who(speaker)}的话（${range}${failed ? `，其中 ${failed} 批没读完` : ''}），候选按符合程度排序。以下都是原话，可以直接引用；最终选哪句由你决定。\n\n${items.join('\n')}`;
}
