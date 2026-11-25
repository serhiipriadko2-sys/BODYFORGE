from pathlib import Path
a=Path('docs/audits/BF_107_CHECKPOINT_PACK_20261125')
s=(a/'patch-qa.py').read_text(encoding='utf-8')
start=s.index('v=once(v,anchor,r"""')
end=s.index('"""+anchor)',start)+len('"""+anchor)')
body=s[start:end]
assert body.startswith('v=once(v,anchor,') and body.endswith('+anchor)')
replacement='assert v.count(anchor)==2\npos=v.rindex(anchor)\nv=v[:pos]+'+body[len('v=once(v,anchor,'):-1]+'+v[pos+len(anchor):]'
with (a/'patch-qa-fixed.py').open('x',encoding='utf-8') as f:f.write(s[:start]+replacement+s[end:])