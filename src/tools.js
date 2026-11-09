// 三个工具的定义（OpenAI function calling 格式）和统一入口。
// 描述是写给模型看的：什么时候用哪个，参数怎么填。按你的平台改措辞，别改掉“分工”的部分。
import { deepRecall } from './search.js';
import { surveyRecall } from './survey.js';
import { timelineRecall } from './timeline.js';

const date = desc => ({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', description: desc });
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });

export const TOOL_DEFINITIONS = [
  fn('deep_recall',
    '需要过去对话的具体细节或原话时使用：检索聊天原文，返回带时间、来源和前后文的原话摘录。用语义描述找话题，同时给出原话里可能出现的词会更准；知道大概时间就填 from/to。“最 xx 的一句”这类评选用 recall_survey，按时间回忆用 recall_timeline。',
    {
      query: { type: 'string', description: '想找的事，用一句话描述' },
      keywords: { type: 'array', items: { type: 'string' }, maxItems: 8, description: '原话里可能出现的词，可不填' },
      from: date('起始日期 YYYY-MM-DD，可不填'),
      to: date('结束日期 YYYY-MM-DD（含当天），可不填'),
    }, ['query']),
  fn('recall_survey',
    '“最蠢的问题”“最甜的一句”“说过最多次的抱怨”这类要把一段历史全翻一遍才能评选的问题使用；找某件具体的事用 deep_recall。按说话人、日期、关键词和是否问句筛出原话，分批初选后返回最多 8 条带时间和上一句的原话候选，由你决定最终答案并引用原话。',
    {
      criterion: { type: 'string', description: '评选标准，如“最蠢的问题”“最肉麻的情话”' },
      speaker: { type: 'string', enum: ['user', 'assistant', 'both'], description: '翻谁说的话：user=她，assistant=你自己，both=两人，默认 user' },
      questions_only: { type: 'boolean', description: '只看问句，找“问过的问题”时打开' },
      keywords: { type: 'array', items: { type: 'string' }, maxItems: 8, description: '只看包含这些词之一的话，可不填' },
      from: date('起始日期 YYYY-MM-DD，可不填'),
      to: date('结束日期 YYYY-MM-DD（含当天），可不填'),
    }, ['criterion']),
  fn('recall_timeline',
    '按时间回忆：when=YYYY-MM 看那个月的月总结、周总结和每天一句话的索引；when=YYYY-MM-DD 看那天的日总结和所在周；再加 view=raw 按页读那天的全部原文。适合“去年这时候我们在干嘛”“十月发生了什么”“那天具体说了什么”。找某件具体的事用 deep_recall。',
    {
      when: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$', description: 'YYYY-MM（某个月）或 YYYY-MM-DD（某一天）' },
      view: { type: 'string', enum: ['summary', 'raw'], description: 'summary 看总结（默认），raw 读那天的原文，只对某一天有效' },
      page: { type: 'integer', minimum: 1, maximum: 50, description: '读原文的页码，默认 1' },
    }, ['when']),
];

// 统一入口：模型调用工具时，把 name 和解析好的 arguments 交给它，返回给模型的文字。
// ctx 见 README「接到你自己的项目里」。
export async function runRecallTool(name, args, ctx) {
  if (name === 'deep_recall') return deepRecall(args, ctx);
  if (name === 'recall_survey') return surveyRecall(args, ctx);
  if (name === 'recall_timeline') return timelineRecall(args, ctx);
  throw new Error('未知的回忆工具：' + name);
}
