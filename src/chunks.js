// 原文切段：同一条线程（一个聊天窗口 / 一个会话）按时间连续切成小段，三个工具都在这些段上工作。
//
// 为什么不一条消息一个向量：短句没有语义（“嗯嗯”“好呀”），一段几句连在一起才知道在聊什么；
// 检索命中时也能直接给出前后文。
//
// 段（chunk）的形状：
//   { id, thread, label, started_at, ended_at, text, vector? }
//   text 是若干行「名字：话」，用 \n 连接；vector 是这段的向量（数字数组或 Float32Array），可以没有。
import { cleanText } from './text.js';
import { withDefaults } from './config.js';

// 一条消息：{ ref, role: 'user'|'assistant', time: ISO 字符串, text }
export function chunkLine(message, options) {
  const { names, chunk } = withDefaults(options);
  const text = message.text.length > chunk.lineChars ? message.text.slice(0, chunk.lineChars) + '…' : message.text;
  return `${message.role === 'user' ? names.user : names.ai}：${text}`;
}

// 把一条线程里按时间排好的新消息续到最后一段（没满就续，满了或隔太久就另起）。
// last：这条线程现有的最后一段（没有就传 null）。返回要写回存储的段：第一段可能是更新过的 last。
// 更新过的段要清掉旧向量重新算。
export function appendToThread({ thread, label, last = null, messages, options }) {
  const { chunk } = withDefaults(options);
  const gap = chunk.gapHours * 3600 * 1000;
  const out = [];
  let current = last ? { ...last, body: last.text.split('\n') } : null, dirty = false;
  const flush = () => { if (current && dirty) { const { body, ...rest } = current; out.push({ ...rest, text: body.join('\n'), lines: body.length, vector: null }); } };
  for (const m of messages) {
    const text = cleanText(m.text, options);
    if (!text || !['user', 'assistant'].includes(m.role)) continue;
    const line = chunkLine({ ...m, text }, options);
    const full = current && (current.body.length >= chunk.maxLines || current.body.join('\n').length + line.length > chunk.maxChars
      || Date.parse(m.time) - Date.parse(current.ended_at) > gap);
    if (!current || full) {
      flush();
      current = { id: null, thread, label, first_ref: m.ref, last_ref: m.ref, started_at: m.time, ended_at: m.time, body: [] };
      dirty = false;
    }
    current.body.push(line); current.last_ref = m.ref; current.ended_at = m.time; dirty = true;
  }
  flush();
  return out;
}

// 一次性从全部消息建段（适合首次导入）。messages 里每条需要带 thread 和 label。
export function buildChunks(messages, options) {
  const threads = new Map();
  for (const m of messages) {
    if (!threads.has(m.thread)) threads.set(m.thread, { label: m.label || m.thread, items: [] });
    threads.get(m.thread).items.push(m);
  }
  const chunks = [];
  for (const [thread, { label, items }] of threads) {
    items.sort((a, b) => a.time.localeCompare(b.time));
    chunks.push(...appendToThread({ thread, label, messages: items, options }));
  }
  return chunks.map((c, i) => ({ ...c, id: c.id ?? i + 1 }));
}

// 检索前的准备：按线程和时间排好，算好向量长度，连上同一线程的前后段（给前文/后文用）。
export function prepareChunks(chunks) {
  const items = [...chunks].sort((a, b) => a.thread.localeCompare(b.thread) || a.started_at.localeCompare(b.started_at)).map(c => {
    const vector = c.vector ? Float32Array.from(c.vector) : null;
    let norm = 0; if (vector) for (const x of vector) norm += x * x;
    return { ...c, vector, norm: Math.sqrt(norm) || 1, lower: c.text.toLowerCase() };
  });
  items.forEach((it, i) => {
    it.prev = items[i - 1]?.thread === it.thread ? items[i - 1] : null;
    it.next = items[i + 1]?.thread === it.thread ? items[i + 1] : null;
  });
  return items;
}
