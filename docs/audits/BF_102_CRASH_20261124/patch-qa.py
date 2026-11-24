from pathlib import Path
from hashlib import sha256
root=Path.cwd()
audit=root/'docs/audits/BF_102_CRASH_20261124'
specs=[('qa/journal-e2e.mjs','BBB1F53A3B225739440FEFE463BF5DA849CE8C45C6EFAA307F9EC45C4001B8B8','ownedProfile','bf-journal-','  observer = await newPage(true);','  // Windows may leave the owned Chrome browser running after its launcher exits.'),('qa/multitab-e2e.mjs','5EAF53A583A87DA1DF0D1B1EBCD8600F74535B8E434F676583E3FC93C604C9CA','profile','bf-multitab-','  let a = await newTab(), b = await newTab();','  // The launcher may already have exited, leaving this test')]
def once(s,old,new):
    if s.count(old)!=1: raise RuntimeError('ambiguous anchor '+old)
    return s.replace(old,new)
updates=[]
for file,expected,prof,prefix,start_end,final_anchor in specs:
    p=root/file
    original=p.read_bytes()
    if sha256(original).hexdigest().upper()!=expected: raise RuntimeError('target drift '+file)
    s=original.decode('utf-8').replace('\r\n','\n')
    s=once(s,"import { spawn } from 'node:child_process';","import { spawn } from 'node:child_process';\nimport { requireDevOrigin, waitForOwnedBrowser, newOwnedPage, closeOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';")
    old="if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');"
    s=once(s,old,"try { await requireDevOrigin(origin); }\ncatch (error) { console.error('QA_INFRA_BLOCKED', String(error)); process.exit(14); }")
    s=once(s,'let port,','let browser,')
    start=s.index('\ntry {\n  // On Windows' if prof=='ownedProfile' else '\ntry {\n  // Windows may exit')
    end=s.index(start_end,start)
    s=s[:start]+'\ntry {\n  browser = await waitForOwnedBrowser('+prof+', chrome);\n'+s[end:]
    needle=chr(96)+'http://127.0.0.1:'+chr(36)+'{port}/json/new?about:blank'+chr(96)
    s=once(s,"const target = await (await fetch("+needle+", { method: 'PUT' })).json();","const target = await newOwnedPage(browser);")
    close=chr(96)+'http://127.0.0.1:'+chr(36)+'{port}/json/close/'+chr(36)+'{this.target.id}'+chr(96)
    old='await fetch('+close+')'+('.catch(() => {})' if prof=='ownedProfile' else '')+';'
    s=once(s,old,'await closeOwnedPage(browser, this.target);')
    end=s.index(final_anchor)
    s=s[:end]+"  try { await cleanupOwnedChrome("+prof+", '"+prefix+"', chrome, browser); }\n  catch (error) { console.error('QA_OWNED_CLEANUP FAIL', String(error)); process.exitCode ||= 17; }\n}\n"
    if chr(36)+'{port}' in s: raise RuntimeError('unexpected unresolved port reference')
    updates.append((p,original,s.encode('utf-8'),expected))
for p,original,new,expected in updates:
    if sha256(p.read_bytes()).hexdigest().upper()!=expected: raise RuntimeError('concurrent drift '+str(p))
for p,original,new,expected in updates:
    (audit/(p.name+'.before')).write_bytes(original)
    p.write_bytes(new)
    print(p.relative_to(root),len(new),sha256(new).hexdigest())