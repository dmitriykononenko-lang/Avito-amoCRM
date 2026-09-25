#!/usr/bin/env bash
# Сборка архива виджета для загрузки в кабинет amoCRM.
# Публичная сборка: manifest без widget.code/secret_key; в script.js запрещены AMOCRM, console., alert(, confirm(.
set -euo pipefail
cd "$(dirname "$0")/../widget"
node --check script.js
if grep -nE "AMOCRM|console\.|alert\(|confirm\(" script.js; then
  echo "❌ Запрещённые для публичной сборки вызовы в script.js" >&2; exit 1
fi
python3 - <<'PY'
import json, pathlib, sys
m = json.load(open('manifest.json'))
bad = [k for k in ('code', 'secret_key') if k in m.get('widget', {})] + [k for k in ('free','countries','category') if k in m]
if bad: sys.exit(f"❌ Лишние поля для публичной сборки: {bad}")
locs = m['widget']['locale']
def keys(d, p=''):
    for k, v in d.items():
        yield from (keys(v, p + k + '.') if isinstance(v, dict) else [p + k])
base = set(keys(json.load(open(f'i18n/{locs[0]}.json'))))
for l in locs[1:]:
    other = set(keys(json.load(open(f'i18n/{l}.json'))))
    if base ^ other: sys.exit(f"❌ Расхождение i18n {locs[0]}/{l}: {sorted(base ^ other)}")
for img in ('logo_min.png','logo_medium.png','logo.png','logo_main.png','logo_small.png'):
    p = pathlib.Path('images') / img
    if not p.exists() or p.stat().st_size > 300_000: sys.exit(f"❌ {p}: нет файла или > 300 KB")
print('✅ manifest, i18n, иконки в порядке')
PY
out="../widget-$(python3 -c "import json;print(json.load(open('manifest.json'))['widget']['version'])").zip"
rm -f "$out"
zip -qr "$out" manifest.json script.js i18n images -x '*.DS_Store'
echo "✅ $(basename "$out") — $(wc -c < "$out") байт"
