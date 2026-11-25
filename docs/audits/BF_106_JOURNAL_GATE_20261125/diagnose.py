from pathlib import Path
import hashlib
root=Path.cwd();a=root/'docs/audits/BF_106_JOURNAL_GATE_20261125';base=root/'.bodyforge-qa/bf106-journal-gate/qa'
p=base/'journal-e2e.mjs';s=p.read_text(encoding='utf-8')
start=s.index("    for (const item of [\n      { name: 'foreign',")
end=s.index('    const legacy =',start)
block=s[start:end]
needle="      check(await page.js(\"!!document.querySelector('[data-quarantined-results]')\"), item.name + ' preserved result remains visible in the working application');"
assert block.count(needle)==1
block=block.replace(needle,"""      const immediate=await page.js("!!document.querySelector('[data-quarantined-results]')");
      const t=Date.now();
      await page.until("!!document.querySelector('[data-quarantined-results]')", item.name+' lazy notice appears');
      console.log('LAZY_NOTICE_DIAGNOSTIC',JSON.stringify({name:item.name,immediate,waitedMs:Date.now()-t,eventual:true}));
      check(await page.js("!!document.querySelector('[data-quarantined-results]')"), item.name + ' preserved result remains visible in the working application');""")
# Reload likewise needs the notice to resolve, independently from app-shell.
needle2="      check(await page.js(\"!!document.querySelector('.app-shell') && !!document.querySelector('[data-quarantined-results]')\"), item.name + ' quarantine and usable profile survive real reload');"
assert block.count(needle2)==1
block=block.replace(needle2,"      await page.until(\"!!document.querySelector('[data-quarantined-results]')\",item.name+' lazy notice after reload');\n"+needle2)
main=s.index("  if (process.argv.includes('--seeded-crash-only'))")
catch=s.index('} catch (error) {',main)
s=s[:main]+block+"  console.log('DIAGNOSTIC_QUARANTINE_COMPLETE',JSON.stringify({assertions,crashes}));\n"+s[catch:]
s=s.replace("from './owned-chrome.mjs'", "from '"+(base/'owned-chrome.mjs').as_uri()+"'")
s=s.replace("from './tower-squat-fixture.mjs'", "from '"+(base/'tower-squat-fixture.mjs').as_uri()+"'")
p=a/'diagnose-quarantine.mjs'
with p.open('x',encoding='utf-8') as out:out.write(s)
print('DIAGNOSTIC',hashlib.sha256(p.read_bytes()).hexdigest())