// 引擎測試：讀取 data/boxes_all.csv，跑幾個典型空間，並檢查排列幾何是否合法
import { readFileSync } from 'node:fs';
import { recommend, normalizeBox } from './engine.js';

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...rest] = rows;
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

const boxes = parseCSV(readFileSync(new URL('../data/boxes_all.csv', import.meta.url), 'utf8')).map(normalizeBox);
console.log('盒子數', boxes.length);

function check(sol, S, gap) {
  const P = sol.placements;
  for (const p of P) {
    if (p.x < gap || p.y < gap || p.x + p.w > S.w - gap || p.y + p.d > S.d - gap) return `越界 ${JSON.stringify(p)}`;
  }
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = P[i], b = P[j];
    const sepX = a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x;
    const sepY = a.y + a.d + gap <= b.y || b.y + b.d + gap <= a.y;
    if (!sepX && !sepY) return `重疊或間隙不足 ${JSON.stringify(a)} ${JSON.stringify(b)}`;
  }
  return 'OK';
}

const cases = [
  { name: '書桌抽屜 60×45×10', space: { w: 60, d: 45, h: 10 } },
  { name: '層架格 38×30×25', space: { w: 38, d: 30, h: 25 } },
  { name: '洗手台下 80×50×55（可堆疊）', space: { w: 80, d: 50, h: 55 }, opts: { allowStack: true } },
  { name: '書桌抽屜 60×45×10（件數少）', space: { w: 60, d: 45, h: 10 }, opts: { mode: 'count' } },
  { name: '書桌抽屜 60×45×10（預算 NT$500）', space: { w: 60, d: 45, h: 10 }, opts: { budget: 500 } },
  { name: '書桌抽屜 60×45×10（只要 MUJI）', space: { w: 60, d: 45, h: 10 }, opts: { brands: ['MUJI'] } },
  { name: '衣櫃抽屜 57×30×15（只要 IKEA，測套組）', space: { w: 57, d: 30, h: 15 }, opts: { brands: ['IKEA'] } },
  { name: '書桌抽屜 60×45×10（只要大創）', space: { w: 60, d: 45, h: 10 }, opts: { brands: ['DAISO'] } },
];

for (const c of cases) {
  const t = Date.now();
  const r = recommend(c.space, boxes, c.opts);
  console.log(`\n=== ${c.name}  (${Date.now() - t}ms)`);
  if (!r.results.length) { console.log(r.note); continue; }
  for (const s of r.results) {
    const over = r.options.budget != null && s.price > r.options.budget ? ' ⚠超出預算' : '';
    console.log(`[${s.label}] 地面填滿 ${(s.floorFill * 100).toFixed(1)}%  體積 ${(s.volumeFill * 100).toFixed(1)}%  ${s.count} 件  NT$${s.price}${s.hasSet ? '(含整組購買)' : ''}${over}  幾何:${check(s, r.space, r.options.gap)}`);
    for (const i of s.items) console.log(`    ${i.qty} × ${i.brand} ${i.name} ${i.size.join('×')}`);
    for (const b of s.shopping.filter((x) => x.kind === 'set')) console.log(`      → 購買 ${b.qty} 組 ${b.name} @${b.unitPrice}`);
  }
}
