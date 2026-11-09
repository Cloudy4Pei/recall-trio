// 接真模型的参考写法：任何兼容 OpenAI 接口的服务都行（OpenAI、DeepSeek、硅基流动、OpenRouter、本地 Ollama……）。
// 只是示例，没有重试、限流和缓存；按你的后端改。密钥从环境变量读，不要写进代码。
//
//   RECALL_BASE_URL     例如 https://api.siliconflow.cn/v1
//   RECALL_API_KEY
//   RECALL_CHAT_MODEL   翻旧账初选用，便宜的就行
//   RECALL_EMBED_MODEL  向量模型，例如 BAAI/bge-m3、Qwen/Qwen3-Embedding-4B
//   RECALL_RERANK_MODEL 重排模型（可选），例如 BAAI/bge-reranker-v2-m3；接口是 Jina / 硅基流动的 /rerank 格式
const env = name => process.env[name] || '';
async function post(path, body) {
  const response = await fetch(env('RECALL_BASE_URL').replace(/\/$/, '') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('RECALL_API_KEY') },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

export async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 32) {
    const data = await post('/embeddings', { model: env('RECALL_EMBED_MODEL'), input: texts.slice(i, i + 32) });
    out.push(...data.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
  }
  return out;
}

export async function rerank(query, documents) {
  if (!env('RECALL_RERANK_MODEL')) return documents.map((_, index) => ({ index, score: 1 - index / documents.length }));
  const data = await post('/rerank', { model: env('RECALL_RERANK_MODEL'), query, documents });
  return data.results.map(r => ({ index: r.index, score: r.relevance_score }));
}

export async function chat(messages, { maxTokens = 400 } = {}) {
  const data = await post('/chat/completions', { model: env('RECALL_CHAT_MODEL'), messages, max_tokens: maxTokens, temperature: 0.2 });
  return data.choices[0].message.content || '';
}
