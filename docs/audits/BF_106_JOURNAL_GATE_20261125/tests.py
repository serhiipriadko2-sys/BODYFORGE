from pathlib import Path
from hashlib import sha256
p=Path('src/lib/profileReplacementRecovery.test.ts')
s=p.read_bytes();assert sha256(s).hexdigest()=='9115d63c6379010d2b9ce119c173247321309e56ff0c68e0ed981c3b6bb8c562'
t=s.decode().replace('\r\n','\n')
t=t.replace('let values: Map<string,string>, held = false;',"let values: Map<string,string>;\nconst held = new Set<string>();")
t=t.replace("if (!held) throw Error('write outside lock');", "if (!held.has(PROFILE_WRITE_LOCK)) throw Error('write outside lock');")
t=t.replace("if(held) throw Error('nested lock');\n  held=true; try { return await callback(); } finally { held=false; }", "if(held.has(_name)) throw Error('recursive same-name lock');\n  held.add(_name); try { return await callback(); } finally { held.delete(_name); }")
t=t.replace('held=false;write.mockClear();', 'held.clear();write.mockClear();')
t=t.replace("if(!held)throw Error('read outside lock');", "if(!held.has(PROFILE_WRITE_LOCK))throw Error('read outside lock');")
anchor="describe('BF-106 locked recovery adapter',()=>{"
assert t.count(anchor)==1
t=t.replace(anchor,anchor+'''
  it('holds exclusive journal barrier from the durable snapshot through rollback read-back',async()=>{
    const marker=stage();
    durable.mockImplementation(async()=>{
      if (!held.has('bodyforge:pilot:v1:durable-write')) throw Error('unprotected durable snapshot');
      return {status:'ready',entries:[]};
    });
    expect(await readReplacementRecovery()).toEqual({state:'applied',marker});
    write.mockImplementation((key,value)=>{
      if (!held.has(PROFILE_WRITE_LOCK) || !held.has('bodyforge:pilot:v1:durable-write')) throw Error('unprotected rollback');
      if(value===null)values.delete(key);else values.set(key,value);
    });
    expect(await restoreInterruptedReplacement(marker,'rollback')).toEqual({status:'rolled-back'});
    expect(values.get(STORAGE_KEY)).toBe(primary);
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(backup);
    expect(values.has(MARKER)).toBe(false);
    expect(request.mock.calls.map(c=>[c[0],(c[1] as LockOptions).mode])).toEqual([
      [PROFILE_WRITE_LOCK,'exclusive'],['bodyforge:pilot:v1:durable-write','exclusive'],
      [PROFILE_WRITE_LOCK,'exclusive'],['bodyforge:pilot:v1:durable-write','exclusive'],
    ]);
  });
''')
p.write_bytes(t.encode())
print('TEST_PATCH',sha256(p.read_bytes()).hexdigest())