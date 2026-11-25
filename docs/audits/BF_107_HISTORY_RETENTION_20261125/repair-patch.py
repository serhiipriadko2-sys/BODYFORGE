from pathlib import Path
a=Path('docs/audits/BF_107_HISTORY_RETENTION_20261125')
s=(a/'patch-fallback-guard.py').read_text(encoding='utf-8')
bad=chr(92)+chr(96)+chr(92)+'$'+'{QUARANTINE_PREFIX}'+chr(92)+'$'+'{index}'+chr(92)+chr(96)
good=chr(96)+'$'+'{QUARANTINE_PREFIX}'+'$'+'{index}'+chr(96)
assert s.count(bad)==1
with (a/'patch-fallback-guard-fixed.py').open('x',encoding='utf-8') as f:f.write(s.replace(bad,good))