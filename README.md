# recall-trio · 回忆三件套

给 AI 陪伴项目用的三个回忆工具，让他能翻你们的聊天记录：

| 工具 | 适合的问题 | 怎么做到的 |
| --- | --- | --- |
| `deep_recall` 原文检索 | “我说背疼那次”——找某件具体的事 | 关键词 + 向量两路检索，合并后重排，返回带时间和前后文的原话 |
| `recall_survey` 翻旧账 | “我问过最蠢的问题”“你说过最肉麻的一句”——要全翻一遍才能评选 | 先按说话人、日期、关键词、问句筛出原话，再分批让模型初选，最后汇总排序 |
| `recall_timeline` 翻日历 | “十月发生了什么”“那天具体聊了什么”——按时间往下钻 | 月 → 日 → 当天原文，三层浏览；有日／周／月总结就一起显示 |

三个工具分工不同，模型会按问题自己挑。它们共用同一份「原文段」：把聊天按时间切成几句一段的小块，向量和关键词都在段上算。

这是从我自己的陪伴项目里拆出来的**参考实现**：纯 JavaScript、没有依赖、不连任何服务。存储和模型调用都由你传进来，所以不管你的前端、后端、数据库长什么样，都可以照着移植。

## 先跑起来看看

需要 Node.js 18 以上。

```bash
npm run demo   # 用虚构的聊天记录跑一遍三个工具
npm test       # 测试
```

演示用的是不联网的玩具模型（`examples/toy-models.js`），效果只是让流程跑通。

## 接到你自己的项目里

最省事的办法：把这个仓库连同 [PORTING.md](PORTING.md) 一起交给你的 AI（Claude、Cursor、Codex……），告诉它你的项目在哪，让它照着移植。PORTING.md 就是写给它看的。

自己动手的话，要做四件事：

1. **导出消息**：把你的聊天记录整理成 `{ thread, label, role, time, text, ref }`。`thread` 是哪个聊天窗口，`label` 是显示给模型看的来源名（如“日常”“微信”），`role` 是 `user` / `assistant`，`time` 是 ISO 时间。
2. **切段并存起来**：首次用 `buildChunks()`；之后有新消息时用 `appendToThread()` 续到最后一段，改过的段要重新算向量。
3. **准备 ctx**：
   ```js
   const ctx = {
     options: { names: { user: '你的称呼', ai: '他的名字' }, timeZone: 'Asia/Shanghai' },
     chunks: prepareChunks(allChunksFromYourDb),   // 每段带 vector（可以没有）
     embed: async texts => [...],                  // 可选：文本 → 向量
     rerank: async (query, docs) => [...],         // 可选：重排
     chat: async (messages, { maxTokens }) => '…', // 翻旧账要用
     calendar: async period => [...],              // 可选：日／周／月总结
     memories: async query => [...],              // 可选：长期记忆库
   };
   ```
   `examples/openai-compatible.js` 是接 OpenAI 兼容接口（硅基流动、DeepSeek、OpenRouter、Ollama 等）的写法。
4. **注册工具**：把 `TOOL_DEFINITIONS` 加进发给模型的 `tools`；模型调用时执行 `runRecallTool(name, args, ctx)`，把返回的文字作为工具结果交回去。

## 几个设计上的小经验

- **不要一条消息一个向量。** “嗯嗯”“好呀”这种短句没有语义；几句一段才知道在聊什么，命中时也能直接带出前后文。
- **只收几小时前的消息。** 最近的本来就在上下文里；也让一段对话能完整地收进同一段。
- **“最 xx 的一句”不是检索问题。** 没有哪句话和“蠢”语义相似，只能全翻一遍。翻旧账一次最多翻 1.2 万句，超过了会请模型缩小范围。
- **清洗很重要。** 你的前端往消息里塞的时间、天气、记忆等注入块要去掉，不然检索全被它们干扰。改 `cleanText()` 的 `injectedTitles`。
- **工具返回原话，结论让模型自己下。** 返回内容都标了时间和来源，模型可以直接引用。

## 默认参数

都在 `src/config.js`：一段最多 6 句 / 700 字、隔 3 小时另起一段、检索返回 3 段、翻旧账每批 300 句 4 批并行、原文每页约 2200 字。RP 一条消息很长的话，把 `maxChars` 和 `lineChars` 调大。

## 许可

[PolyForm Noncommercial 1.0.0](LICENSE)：个人、学习、研究、兴趣项目和非商业组织可以免费使用、修改、转发，转发时保留许可和署名；**不能商用**。白话说明见 [NOTICE.md](NOTICE.md)，想商用请先联系作者。

由 [@Cloudy4Pei](https://github.com/Cloudy4Pei) 和 Claude 一起写成。

---

## English

**recall-trio** is a dependency-free reference implementation of three memory tools for AI companion apps:

- `deep_recall` — hybrid keyword + vector search over chat history with reranking; returns quotes with timestamps and surrounding lines.
- `recall_survey` — for “what was the silliest question I ever asked?”: filters lines by speaker / date / keywords / questions, has a model shortlist them in parallel batches, then ranks the finalists.
- `recall_timeline` — browse by time: month → day → the raw transcript of that day, alongside optional daily/weekly/monthly summaries.

Storage and model calls are injected, so it can be ported to any stack. Run `npm run demo` to see it on a fictional chat, and hand [PORTING.md](PORTING.md) to your coding assistant to adapt it. Prompts and tool descriptions are in Chinese; translate them if your companion speaks another language. Licensed under [PolyForm Noncommercial 1.0.0](LICENSE): free for noncommercial use; see [NOTICE.md](NOTICE.md).
