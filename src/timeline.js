// 翻日历 recall_timeline：按时间回忆。“十月发生了什么”“去年这时候在干嘛”“那天具体说了什么”。
// 三层往下钻：某个月（月总结 + 周总结 + 每天一句）→ 某一天（日总结 + 所在周）→ 那天的原文（按页）。
import { dayStart, localDay, localTime, oneLine } from './text.js';
import { withDefaults } from './config.js';

// ctx.calendar（可选）：async (period: 'day'|'week'|'month') => [{ date, label, content }]
//   date 的格式：day 用 YYYY-MM-DD，week 用 YYYY-MM-Wnn（ISO 周号），month 用 YYYY-MM。
//   没有日历摘要也能用：只列每天的原文段数，原文照样能读。
async function pages(ctx, period) {
  if (!ctx.calendar) return [];
  try { const list = await ctx.calendar(period); return Array.isArray(list) ? list : []; } catch { return null; }
}
export function isoWeek(day) {
  const d = new Date(day + 'T00:00:00Z'), wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd + 3);
  const year = d.getUTCFullYear(), first = new Date(Date.UTC(year, 0, 4));
  return { year, week: 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7) };
}
// 某天的原文：所有来源按时间排好，按字数分页。
export function dayRawPages(day, ctx) {
  const o = withDefaults(ctx.options);
  const lo = dayStart(day, o.timeZone), hi = dayStart(day, o.timeZone, 1);
  const chunks = ctx.chunks.filter(c => c.started_at >= lo && c.started_at < hi).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const out = []; let page = '';
  for (const c of chunks) {
    const block = `[${localTime(c.started_at, o.timeZone)} · ${c.label}]\n${c.text}`;
    if (page && page.length + block.length > o.timeline.rawPage) { out.push(page); page = ''; }
    page += (page ? '\n\n' : '') + block;
  }
  if (page) out.push(page);
  return out;
}
async function monthView(month, ctx) {
  const o = withDefaults(ctx.options);
  const [monthPages, dayPages, weekPages] = await Promise.all([pages(ctx, 'month'), pages(ctx, 'day'), pages(ctx, 'week')]);
  const [y, m] = month.split('-').map(Number), next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  const lo = dayStart(month + '-01', o.timeZone), hi = dayStart(next, o.timeZone);
  const parts = [`【${y}年${m}月】`];
  if (monthPages === null) parts.push('（日历摘要暂时读不到，下面只列原文条数）');
  const mp = monthPages?.find(p => p.date === month);
  if (mp) parts.push('月总结：' + mp.content.trim());
  const weeks = (weekPages || []).filter(p => p.date.startsWith(month + '-W'));
  if (weeks.length) parts.push('周总结：\n' + weeks.map(w => `- ${w.label}：${oneLine(w.content, 120)}`).join('\n'));
  const days = new Map((dayPages || []).filter(p => p.date.startsWith(month + '-')).map(p => [p.date, p]));
  const counts = new Map();
  for (const c of ctx.chunks) if (c.started_at >= lo && c.started_at < hi) { const d = localDay(c.started_at, o.timeZone); counts.set(d, (counts.get(d) || 0) + 1); }
  const all = [...new Set([...days.keys(), ...counts.keys()])].sort();
  if (all.length) parts.push('每天：\n' + all.map(d => `- ${d}${days.get(d) ? '：' + oneLine(days.get(d).content, o.timeline.dayLine) : ctx.calendar ? '：（没有日总结）' : ''}${counts.get(d) ? `（原文 ${counts.get(d)} 段）` : ''}`).join('\n'));
  else parts.push('这个月没有日历总结，也没有收录的原文。');
  parts.push('想看哪天的细节，用 when=那天日期；要原话用 view=raw。');
  return parts.join('\n\n');
}
async function dayView(day, ctx) {
  const [dayPages, weekPages] = await Promise.all([pages(ctx, 'day'), pages(ctx, 'week')]);
  const dp = dayPages?.find(p => p.date === day), { year, week } = isoWeek(day);
  const wp = weekPages?.find(p => p.date.startsWith(String(year)) && p.date.endsWith('-W' + String(week).padStart(2, '0')));
  const raw = dayRawPages(day, ctx).length;
  const parts = [`【${day}】`];
  if (dayPages === null) parts.push('（日历摘要暂时读不到）');
  if (ctx.calendar) parts.push(dp ? `日总结（${dp.label}）：${dp.content.trim()}` : '这天没有日总结。');
  if (wp) parts.push(`所在周（${wp.label}）：${oneLine(wp.content, 200)}`);
  parts.push(raw ? `这天收录了 ${raw} 页原文，用 view=raw 读第 1 页。` : '这天没有收录的原文。');
  return parts.join('\n\n');
}
// 工具入口：when=YYYY-MM 或 YYYY-MM-DD；view=raw 时按 page 读那天的原文。
export async function timelineRecall(args, ctx) {
  const when = String(args.when || '').trim();
  if (/^\d{4}-\d{2}$/.test(when)) return monthView(when, ctx);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when) || !Number.isFinite(Date.parse(when))) return 'when 需要是 YYYY-MM（某个月）或 YYYY-MM-DD（某一天）。';
  if (args.view !== 'raw') return dayView(when, ctx);
  const list = dayRawPages(when, ctx), page = Math.max(1, Math.min(Number(args.page) || 1, list.length || 1));
  if (!list.length) return `${when} 没有收录的原文。`;
  return `【${when} 原文 · 第 ${page}/${list.length} 页】\n\n${list[page - 1]}${page < list.length ? `\n\n（还有下一页：page=${page + 1}）` : ''}`;
}
