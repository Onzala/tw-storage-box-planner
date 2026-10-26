// 檢查 site/dist/index.html：三段 script 能解析，嵌入資料能正確還原
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../site/dist/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
scripts.forEach((s, i) => { new vm.Script(s); console.log('script', i, 'ok'); });

const ctx = vm.createContext({});
vm.runInContext(scripts[0].replace(/const (RAW_\w+|DATA_DATE)/g, 'globalThis.$1'), ctx);
const { RAW_BOXES, RAW_ACC, RAW_TIPS, DATA_DATE } = ctx;
console.log('boxes', RAW_BOXES.length, 'accessories', RAW_ACC.length, 'tips', RAW_TIPS.length, 'date', DATA_DATE);
console.log('sample box', RAW_BOXES[0].id, RAW_BOXES[0].outer_w, RAW_BOXES[0].name);
console.log('sample tip', RAW_TIPS.at(-1).id, RAW_TIPS.at(-1).title);
