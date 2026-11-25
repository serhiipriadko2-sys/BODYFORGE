from pathlib import Path
from hashlib import sha256
p=Path('qa/receipt-preview-e2e.mjs')
a=Path('docs/audits/BF_105_RECEIPT_SCHEMA_20261124')
old=p.read_bytes()
assert sha256(old).hexdigest()=='e56b9065d78bf456dc9696dba3e4e71b9a5ba22e154582e7d14dfca9aa6687a1'
s=old.decode('utf-8').replace('\r\n','\n')
def once(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
once("async function inspect() {\n  const p = await import('/src/lib/progression.ts');",
"""async function inspect() {
  const p = await import('/src/lib/progression.ts');
  // Resolve module imports before instrumenting storage in an active App.
  // From this point through finally there is no await: React startup and
  // other task/microtask callbacks cannot be mistaken for adapter calls.
  const m = await import('/src/lib/receiptCompatibility.ts');""")
once("    const m = await import('/src/lib/receiptCompatibility.ts');\n    preview = m.previewReceiptMigration(raw);","    preview = m.previewReceiptMigration(raw);")
once("  check(view.calls === 0 && view.unchanged && view.deterministic && view.roundTrip === view.raw, label + ' preview is read-only and reversible');",
"""  if (view.calls !== 0 || !view.unchanged || !view.deterministic || view.roundTrip !== view.raw) {
    console.error('BF105_PREVIEW_DIAGNOSTIC', JSON.stringify({ label, calls:view.calls, unchanged:view.unchanged,
      deterministic:view.deterministic, exactRoundTrip:view.roundTrip===view.raw,
      status:view.preview.status, reason:view.preview.reason }));
  }
  check(view.calls === 0 && view.unchanged && view.deterministic && view.roundTrip === view.raw, label + ' preview is read-only and reversible');""")
with (a/'receipt-preview-e2e.mjs.pre-timing-fix').open('xb') as f: f.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode())
print('QA_PATCH',p.stat().st_size,sha256(p.read_bytes()).hexdigest())