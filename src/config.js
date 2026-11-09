// 默认参数。移植时按你的聊天习惯调：RP 一条很长可以把 maxChars 调大，聊天很碎可以把 gapHours 调小。
export const DEFAULTS = {
  names: { user: '用户', ai: '助手' },   // 原文里两个人的称呼，会写进每一行「名字：话」
  timeZone: 'Asia/Shanghai',            // 日期都按这个时区算
  chunk: {
    maxLines: 6,        // 一段最多几句
    maxChars: 700,      // 一段最多多少字
    lineChars: 300,     // 一句最多收多少字，超出截断加「…」
    gapHours: 3,        // 两句间隔超过这么久就另起一段
  },
  search: { candidates: 30, rerankTop: 24, limit: 3 },
  survey: { batch: 300, maxLines: 12000, parallel: 4, lineChars: 200, final: 8 },
  timeline: { rawPage: 2200, dayLine: 60 },
};
export function withDefaults(options = {}) {
  return {
    ...DEFAULTS, ...options,
    names: { ...DEFAULTS.names, ...options.names },
    chunk: { ...DEFAULTS.chunk, ...options.chunk },
    search: { ...DEFAULTS.search, ...options.search },
    survey: { ...DEFAULTS.survey, ...options.survey },
    timeline: { ...DEFAULTS.timeline, ...options.timeline },
  };
}
