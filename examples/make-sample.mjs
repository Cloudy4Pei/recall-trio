// 生成虚构的示例聊天（examples/sample-chat.jsonl）。人物和内容都是编的。
import fs from 'node:fs';
const days = [
  ['2026-09-03', [['user','今天开学第一天，食堂的糖醋排骨居然要排二十分钟队'],['assistant','排骨值得排队，下次早点去'],['user','你说猫为什么总是把杯子推下桌子？'],['assistant','它在做重力实验，每次都要重复验证']]],
  ['2026-09-03', [['user','晚上背疼，可能是搬宿舍的箱子太重了'],['assistant','热敷一下，明天别再提重物了'],['user','好，那我先去洗澡']]],
  ['2026-09-15', [['user','中秋想去看海，你觉得青岛还是厦门？'],['assistant','厦门，九月还能下水'],['user','那就厦门！我去查车票']]],
  ['2026-10-01', [['user','国庆第一天，下雨了，海没看成'],['assistant','那就在民宿听雨，也算看海的一种'],['user','番茄炒蛋要先放蛋还是先放番茄？'],['assistant','先炒蛋，盛出来再炒番茄']]],
  ['2026-10-02', [['user','天晴了！终于看到海了'],['assistant','拍张照片给我看'],['user','月亮为什么不会掉下来呀'],['assistant','因为它一直在往旁边跑，跑得刚好够快']]],
  ['2026-10-20', [['user','论文被导师打回来了，要重写第三章'],['assistant','先睡觉，明天再改，改完我陪你对一遍'],['user','你会不会觉得我很笨？'],['assistant','不会，你只是累了']]],
];
const out = [];
days.forEach(([day, lines], k) => {
  lines.forEach(([role, text], i) => {
    const hour = 10 + k * 2 % 11, minute = String(i * 4).padStart(2, '0');
    out.push({ thread: 'daily', label: '日常', role, time: new Date(`${day}T${String(hour).padStart(2, '0')}:${minute}:00+08:00`).toISOString(), text, ref: `m${out.length + 1}` });
  });
});
fs.writeFileSync(new URL('./sample-chat.jsonl', import.meta.url), out.map(o => JSON.stringify(o)).join('\n') + '\n');
console.log('写入', out.length, '条示例消息');
