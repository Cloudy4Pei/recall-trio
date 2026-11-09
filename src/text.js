// 文本和时间的小工具：清洗原文、拆检索词、按时区算日期边界。

// 去掉思考、附件等标签和注入块，只留真正说出口的话。
// injectedTitles：你的前端往消息里塞的【当前时间】【相关记忆】之类的块，按需增删。
export const DEFAULT_INJECTED = ['当前时间', '当前天气', '当前位置', '相关记忆', '对话摘要'];
export function cleanText(text, { keepLines = false, injectedTitles = DEFAULT_INJECTED } = {}) {
  let s = String(text || '')
    .replace(/<(think|thinking|attachment|thought|status)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[a-zA-Z_][^>]*\/>/g, '').replace(/<\/?[a-zA-Z_][^>]*>/g, '');
  if (injectedTitles.length) {
    const titles = injectedTitles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    s = s.replace(new RegExp(`【(${titles})[^】]*】[\\s\\S]*?(?=\\n\\s*\\n|\\n?【|$)`, 'g'), '');
  }
  return s.split('\n').map(x => x.trim()).filter(Boolean).join(keepLines ? '\n' : ' ').trim();
}

// 把问题和模型给的关键词拆成检索词：2 到 16 个字，最多 12 个。中文两字词也能命中。
export function searchTerms(query, keywords = []) {
  const parts = [...keywords, ...String(query).split(/[\s，。、！？,.!?；;：:“”"'‘’（）()《》【】\[\]]+/)];
  return [...new Set(parts.map(s => String(s).trim().toLowerCase()).filter(s => s.length >= 2 && s.length <= 16))].slice(0, 12);
}

// 某个时区里 day（YYYY-MM-DD）这一天开始的时刻（ISO 字符串）；offset 天数可正可负。
export function dayStart(day, timeZone, offset = 0) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d + offset);
  // 用该时区在这个时刻的偏移量校正一次（夏令时附近再校正一次）。
  let at = guess - zoneOffset(guess, timeZone);
  at = guess - zoneOffset(at, timeZone);
  return new Date(at).toISOString();
}
function zoneOffset(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(ms / 1000) * 1000;
}
export const localDay = (iso, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
export const localTime = (iso, timeZone) => new Intl.DateTimeFormat('zh-CN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
export const stamp = (iso, timeZone) => new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  .format(new Date(iso)).replaceAll('/', '-');
export const oneLine = (text, n) => { const s = String(text || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
