# 組裝網站：把 data/boxes_all.csv 與 engine/engine.js 嵌入 site/app.html → site/dist/index.html
import csv, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEEP = ['id', 'brand', 'series', 'name', 'outer_w', 'outer_d', 'outer_h', 'inner_w', 'inner_d', 'inner_h',
        'color', 'stackable', 'has_lid', 'price_twd', 'price_date', 'url', 'notes']
# 網站用不到的欄位不嵌入，控制頁面大小（完整資料仍在 CSV 與試算表）
ACC_KEEP = ['id', 'brand', 'category', 'name', 'length_min', 'length_max', 'width', 'depth', 'height', 'diameter',
            'load_kg', 'mount', 'material', 'price_twd', 'url', 'usage', 'notes']
# 不放進網站的技巧 id（CSV 與試算表仍保留）
SITE_EXCLUDE = set()
TIP_KEEP = ['id', 'space', 'topic', 'title', 'tip', 'how_to', 'uses_products', 'uses_accessories',
            'source_name', 'source_type', 'url', 'published_date', 'confidence']
with open(ROOT / 'data' / 'boxes_all.csv', encoding='utf-8-sig') as fh:
    rows = [{k: r[k] for k in KEEP} for r in csv.DictReader(fh)]
dates = sorted({r['price_date'] for r in rows})

acc_path = ROOT / 'data' / 'accessories_all.csv'
accs = []
if acc_path.exists():
    with open(acc_path, encoding='utf-8-sig') as fh:
        accs = [{k: r[k] for k in ACC_KEEP} for r in csv.DictReader(fh)]

tips_path = ROOT / 'data' / 'tips_all.csv'
tips = []
if tips_path.exists():
    with open(tips_path, encoding='utf-8-sig') as fh:
        tips = [{k: r[k] for k in TIP_KEEP} for r in csv.DictReader(fh) if r['id'] not in SITE_EXCLUDE]

# 以表格形式嵌入（欄位名只寫一次），頁面較小；頁面載入時再還原成物件陣列
def packed(name, records, cols):
    table = {'cols': cols, 'rows': [[r[c] for c in cols] for r in records]}
    return f'const {name} = unpackTable(' + json.dumps(table, ensure_ascii=False, separators=(',', ':')) + ');\n'

data_js = ('function unpackTable(t) { return t.rows.map((r) => Object.fromEntries(t.cols.map((c, i) => [c, r[i]]))); }\n'
           + packed('RAW_BOXES', rows, KEEP)
           + packed('RAW_ACC', accs, ACC_KEEP)
           + packed('RAW_TIPS', tips, TIP_KEEP)
           + 'const DATA_DATE = ' + json.dumps(dates[-1]) + ';')
engine = (ROOT / 'engine' / 'engine.js').read_text(encoding='utf-8')
engine = re.sub(r'^export\s+', '', engine, flags=re.M)

html = (ROOT / 'site' / 'app.html').read_text(encoding='utf-8')
assert '/*__DATA__*/' in html and '/*__ENGINE__*/' in html
html = html.replace('/*__DATA__*/', data_js.replace('</', '<\\/')).replace('/*__ENGINE__*/', engine)
out = ROOT / 'site' / 'dist' / 'index.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
# 本機預覽用：補上發布時才會加的文件骨架
(out.parent / 'preview.html').write_text(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    '<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>' + html + '</body></html>',
    encoding='utf-8')
print(out, f'{len(html.encode()) / 1024:.0f} KB', len(rows), 'boxes', len(accs), 'accessories', len(tips), 'tips')
