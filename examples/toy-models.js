// 演示和测试用的玩具模型：不联网、结果固定。效果远不如真模型，只为了让流程跑通。

// 玩具向量：把文本里每个相邻两字散列到 256 维。
export async function toyEmbed(texts) {
  return texts.map(text => {
    const v = new Array(256).fill(0), s = String(text);
    for (let i = 0; i < s.length - 1; i++) {
      let h = 0; for (const ch of s.slice(i, i + 2)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
      v[h % 256] += 1;
    }
    return v;
  });
}

// 玩具聊天模型：只会翻旧账那两种提示——初选时挑带问号的句子，汇总时原样排序。
export async function toyChat(messages) {
  const [system, user] = messages.map(m => m.content);
  const rows = user.split('\n').map(l => l.match(/^#(\d+) (.*)$/)).filter(Boolean);
  if (system.includes('"ranked"')) return JSON.stringify({ ranked: rows.map(r => Number(r[1])) });
  const picks = rows.filter(r => /[?？]/.test(r[2])).slice(0, 3).map(r => ({ id: Number(r[1]), why: '是个好问题' }));
  return JSON.stringify({ picks });
}
