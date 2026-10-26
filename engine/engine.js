// 收納盒尺寸適配計算引擎 v1
// 兩階段斷頭台排列（guillotine）：先把空間寬度切成多個「欄」，每欄沿深度方向放一排盒子。
// 單位內部一律用 mm 整數，格點 step（預設 5mm）。盒子尺寸向上取整、空間尺寸向下取整，結果保守。

const SET_RE = /^SET:([^|]*)\|(\d*)\|(\d+)\|(\d+);/;

/** 把 CSV 的一列（字串欄位）轉成引擎用的盒子物件 */
export function normalizeBox(r) {
  const n = (v) => (v === '' || v == null ? null : Number(v));
  const box = {
    id: r.id, brand: r.brand, series: r.series, name: r.name,
    w: n(r.outer_w), d: n(r.outer_d), h: n(r.outer_h),
    iw: n(r.inner_w), id_: n(r.inner_d), ih: n(r.inner_h),
    stackable: r.stackable === 'Y', hasLid: r.has_lid === 'Y',
    price: n(r.price_twd), url: r.url, notes: r.notes || '', color: r.color || '',
    set: null, priceEstimated: false,
  };
  const m = SET_RE.exec(box.notes);
  if (m) {
    const setPrice = m[2] ? Number(m[2]) : null;
    box.set = { code: m[1], price: setPrice, qtyInSet: Number(m[3]), total: Number(m[4]) };
    if (box.price == null && setPrice != null) {
      box.price = Math.round(setPrice / box.set.total);   // 套組平均單價，僅供估算
      box.priceEstimated = true;
    }
  }
  return box;
}

const DEFAULTS = {
  step: 5,            // 格點 mm
  gap: 5,             // 盒與盒、盒與壁的間隙 mm（每邊 0.5cm）
  topGap: null,       // 上方間隙，null＝同 gap
  allowRotate: true,  // 允許盒子在水平面旋轉 90°
  allowStack: false,  // 允許堆疊（只對 stackable=Y 的盒子）
  maxLayers: 3,
  mode: 'fill',       // 'fill' 填滿率優先 | 'count' 件數少優先
  budget: null,       // 預算上限 NT$，null＝不限
  brands: null,       // 例如 ['MUJI','IKEA']，null＝全部
  excludeIds: [],
  minBoxH: null,      // 盒子高度下限 cm（例如要放直立物品）
  maxResults: 6,
};

/**
 * 主函式
 * @param {{w:number,d:number,h:number}} space 空間內尺寸 cm（寬×深×高）
 * @param {object[]} boxes normalizeBox 後的盒子陣列
 * @param {object} opts 見 DEFAULTS
 */
export function recommend(space, boxes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const topGap = o.topGap ?? o.gap;
  const S = { w: floorTo(space.w * 10, o.step), d: floorTo(space.d * 10, o.step), h: Math.floor(space.h * 10) };
  const area = S.w * S.d;

  let cands = boxes.filter((b) => b.w && b.d && b.h
    && (!o.brands || o.brands.includes(b.brand))
    && !o.excludeIds.includes(b.id)
    && (o.minBoxH == null || b.h >= o.minBoxH)
    && (o.budget == null || b.price != null));

  // 展開為「放置選項」：方向 × 疊層數
  const opts_ = [];
  for (const b of cands) {
    const bw = ceilTo(b.w * 10, o.step), bd = ceilTo(b.d * 10, o.step), bh = Math.ceil(b.h * 10);
    if (bh + topGap > S.h) continue;
    let layers = 1;
    if (o.allowStack && b.stackable) layers = Math.max(1, Math.min(o.maxLayers, Math.floor((S.h - topGap) / bh)));
    const dirs = [[bw, bd, false]];
    if (o.allowRotate && bw !== bd) dirs.push([bd, bw, true]);
    for (const [w, d, rot] of dirs) {
      if (w + 2 * o.gap > S.w || d + 2 * o.gap > S.d) continue;
      opts_.push({ box: b, w, d, h: bh, layers, rot,
        realArea: b.w * b.d * 100, realVol: b.w * b.d * b.h * 1000 * layers,
        price: (b.price ?? 0) * layers });
    }
  }
  if (!opts_.length) return { space: S, results: [], note: '沒有任何盒子放得進這個空間（檢查高度與間隙）' };

  const ctx = { S, o, area, topGap };
  const runs = [];
  // 1) 全部混搭
  runs.push({ label: '混搭最佳', kind: 'mixed', list: opts_ });
  // 2) 單一系列（外觀統一）
  const bySeries = groupBy(opts_, (x) => x.box.brand + '｜' + x.box.series);
  for (const [k, list] of bySeries) runs.push({ label: `同系列：${k}`, kind: 'series', list });
  // 3) 單一款式（最好買、最整齊）
  const byBox = groupBy(opts_, (x) => x.box.id);
  for (const [, list] of byBox) runs.push({ label: `單一款式：${list[0].box.name}`, kind: 'single', list });

  const sols = [];
  for (const run of runs) {
    const sol = solveWithBudget(run.list, ctx);
    if (sol && sol.count > 0) sols.push({ ...sol, label: run.label, kind: run.kind });
  }
  // 4) 精簡混搭：只用混搭最佳解裡面積貢獻前 2／前 3 名的款式重排，避免一格抽屜出現四五種盒子
  const mixed = sols.find((s) => s.kind === 'mixed');
  if (mixed && mixed.items.length > 2) {
    const ranked = [...mixed.items].sort((a, b) => b.qty * b.size[0] * b.size[1] - a.qty * a.size[0] * a.size[1]);
    for (const k of [2, 3]) {
      if (ranked.length <= k) continue;
      const keep = new Set(ranked.slice(0, k).map((i) => i.id));
      const sol = solveWithBudget(opts_.filter((x) => keep.has(x.box.id)), ctx);
      if (sol && sol.count > 0) sols.push({ ...sol, label: `精簡混搭（${k} 款）`, kind: 'mixed' });
    }
  }
  // 移除面積貢獻 < 3% 的零碎填縫款式（只剩一款時保留）
  for (const s of sols) pruneMinor(s, ctx);
  // 去重（同樣的盒子組合只留分數最高的）
  const seen = new Map();
  for (const s of sols) {
    const sig = s.items.map((i) => i.id + 'x' + i.qty).sort().join(',');
    if (!seen.has(sig) || seen.get(sig).score < s.score) seen.set(sig, s);
  }
  const uniq = [...seen.values()].sort((a, b) => b.score - a.score);
  // 結果組合：混搭最佳 + 最佳同系列數組 + 最佳單一款式數組，避免全是同類
  const pick = [], take = (kind, n) => uniq.filter((s) => s.kind === kind && !pick.includes(s)).slice(0, n).forEach((s) => pick.push(s));
  take('mixed', 2);
  take('series', Math.ceil((o.maxResults - 1) / 2));
  take('single', o.maxResults - pick.length);
  pick.sort((a, b) => b.score - a.score);
  return { space: S, options: o, results: pick };
}

// ---- 內部 ----

function solveWithBudget(list, ctx) {
  const { o, area } = ctx;
  const base = solve(list, ctx, 0);
  if (o.budget == null || !base || base.price <= o.budget) return base;
  // 拉格朗日鬆弛：價格懲罰 β 做二分搜尋，找預算內填滿率最高的解
  const minPrice = Math.max(1, Math.min(...list.map((x) => x.price || Infinity)));
  let lo = 0, hi = area / minPrice, best = null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const s = solve(list, ctx, mid);
    if (s && s.price <= o.budget) { if (!best || s.floorFill > best.floorFill) best = s; hi = mid; }
    else lo = mid;
  }
  return best;
}

function solve(list, ctx, beta) {
  const a = pack(list, ctx, beta, false);
  const b = pack(list, ctx, beta, true);   // 換向：先沿深度切欄
  const pickBest = !a ? b : !b ? a : (a.score >= b.score ? a : b);
  return pickBest;
}

function itemScore(x, ctx, beta) {
  const { S, o, area, topGap } = ctx;
  const heightUse = (x.h * x.layers) / (S.h - topGap);
  const perBox = o.mode === 'count' ? 0.04 : 0.002;
  // 地面面積為主，高度利用率加權（太矮的盒子放在高空間裡分數打折）
  return x.realArea * (0.4 + 0.6 * Math.min(1, heightUse)) - perBox * area - beta * x.price;
}

function pack(list, ctx, beta, transpose) {
  const { S, o } = ctx;
  const g = o.gap, st = o.step;
  const W = (transpose ? S.d : S.w) - g, D = (transpose ? S.w : S.d) - g;   // 已扣掉一側壁間隙
  const Wq = Math.floor(W / st), Dq = Math.floor(D / st);
  const items = list.map((x) => {
    const w = transpose ? x.d : x.w, d = transpose ? x.w : x.d;
    return { x, wq: (w + g) / st, dq: (d + g) / st, w, d, s: itemScore(x, ctx, beta) };
  }).filter((it) => it.s > 0 && it.wq <= Wq && it.dq <= Dq);
  if (!items.length) return null;

  // 欄寬候選＝各盒子的（寬＋間隙）
  const colWidths = [...new Set(items.map((it) => it.wq))].sort((a, b) => a - b);
  const cols = new Map();
  for (const c of colWidths) {
    const usable = items.filter((it) => it.wq <= c);
    const best = new Float64Array(Dq + 1), choice = new Int32Array(Dq + 1).fill(-1);
    for (let y = 1; y <= Dq; y++) {
      best[y] = best[y - 1]; choice[y] = -1;
      for (let k = 0; k < usable.length; k++) {
        const it = usable[k];
        if (it.dq <= y) { const v = best[y - it.dq] + it.s; if (v > best[y] + 1e-9) { best[y] = v; choice[y] = k; } }
      }
    }
    const seq = [];
    for (let y = Dq; y > 0;) { const k = choice[y]; if (k < 0) { y--; continue; } seq.push(usable[k]); y -= usable[k].dq; }
    if (best[Dq] > 0) cols.set(c, { score: best[Dq], seq });
  }
  const colList = [...cols.entries()];
  const best = new Float64Array(Wq + 1), choice = new Int32Array(Wq + 1).fill(-1);
  for (let x = 1; x <= Wq; x++) {
    best[x] = best[x - 1]; choice[x] = -1;
    for (let k = 0; k < colList.length; k++) {
      const [c, col] = colList[k];
      if (c <= x) { const v = best[x - c] + col.score; if (v > best[x] + 1e-9) { best[x] = v; choice[x] = k; } }
    }
  }
  const columns = [];
  for (let x = Wq; x > 0;) { const k = choice[x]; if (k < 0) { x--; continue; } columns.push(colList[k]); x -= colList[k][0]; }
  if (!columns.length) return null;

  // 產生座標（mm，盒子實際外寸、含間隙）
  const placements = [];
  let cx = g;
  for (const [c, col] of columns) {
    let cy = g;
    for (const it of col.seq) {
      const p = { id: it.x.box.id, x: cx, y: cy, w: it.w, d: it.d, layers: it.x.layers, rot: it.x.rot, score: it.s };
      placements.push(transpose ? { ...p, x: p.y, y: p.x, w: p.d, d: p.w } : p);
      cy += it.dq * st;
    }
    cx += c * st;
  }
  return summarize(placements, list, ctx, best[Wq]);
}

function pruneMinor(s, ctx) {
  const { S } = ctx;
  if (s.items.length < 2) return;
  const minor = new Set(s.items.filter((i) => placedArea(s, i.id) / (S.w * S.d) < 0.03).map((i) => i.id));
  if (!minor.size || minor.size === s.items.length) return;
  const placements = s.placements.filter((p) => !minor.has(p.id));
  const list = s._list.filter((x) => !minor.has(x.box.id));
  const scoreLoss = s.placements.filter((p) => minor.has(p.id)).reduce((t, p) => t + p.score, 0);
  Object.assign(s, summarize(placements, list, ctx, s.score - scoreLoss));
}

function placedArea(s, id) {
  return s.placements.filter((p) => p.id === id).reduce((t, p) => t + p.w * p.d, 0);
}

function summarize(placements, list, ctx, score) {
  const { S } = ctx;
  const boxById = new Map(list.map((x) => [x.box.id, x.box]));
  const agg = new Map();
  let realArea = 0, realVol = 0, count = 0;
  for (const p of placements) {
    const b = boxById.get(p.id);
    const q = p.layers;
    const it = agg.get(p.id) || { id: p.id, name: b.name, brand: b.brand, series: b.series, url: b.url,
      unitPrice: b.price, priceEstimated: b.priceEstimated, set: b.set, size: [b.w, b.d, b.h], qty: 0 };
    it.qty += q; agg.set(p.id, it);
    realArea += b.w * b.d * 100; realVol += b.w * b.d * b.h * 1000 * q; count += q;
  }
  const items = [...agg.values()].sort((a, b) => b.qty - a.qty);
  // 購買清單：單售品照件數；套組／多件裝要整組買，組數＝各尺寸需求件數 ÷ 組內件數 的最大值（無條件進位）
  const shopping = [], sets = new Map();
  let price = 0, priceUnknown = false;
  for (const it of items) {
    if (it.set && it.set.price != null) {
      const s = sets.get(it.set.code) || { code: it.set.code, setPrice: it.set.price, total: it.set.total, sets: 0, parts: [] };
      s.sets = Math.max(s.sets, Math.ceil(it.qty / it.set.qtyInSet));
      s.parts.push({ id: it.id, name: it.name, need: it.qty });
      sets.set(it.set.code, s);
    } else {
      shopping.push({ kind: 'single', id: it.id, name: it.name, url: it.url, qty: it.qty, unitPrice: it.unitPrice, subtotal: it.unitPrice == null ? null : it.unitPrice * it.qty });
      if (it.unitPrice == null) priceUnknown = true; else price += it.unitPrice * it.qty;
    }
  }
  for (const s of sets.values()) {
    const first = items.find((i) => i.set && i.set.code === s.code);
    shopping.push({ kind: 'set', code: s.code, name: first.name.replace(/（拆件.*?）/, ''), url: first.url, qty: s.sets, unitPrice: s.setPrice, subtotal: s.setPrice * s.sets, parts: s.parts });
    price += s.setPrice * s.sets;
  }
  const hasSet = sets.size > 0;
  return {
    score, placements, items, shopping, count, price, priceUnknown, hasSet, _list: list,
    floorFill: realArea / (S.w * S.d),
    volumeFill: realVol / (S.w * S.d * S.h),
    brands: [...new Set(items.map((i) => i.brand))],
  };
}

function groupBy(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
function ceilTo(v, s) { return Math.ceil(Math.round(v * 1000) / 1000 / s) * s; }
function floorTo(v, s) { return Math.floor(Math.round(v * 1000) / 1000 / s) * s; }
