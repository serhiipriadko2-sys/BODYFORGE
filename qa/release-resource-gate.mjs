// Release QA resource preflight. Windows is the pinned release runner platform.
// No resource reservation, OS setting changes, process termination, or automatic retry.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const RESOURCE_MINIMUM_MIB = Object.freeze({ physicalMiB: 2048, virtualMiB: 4096 });
const fields=['physicalMiB','virtualMiB','totalPhysicalMiB','totalVirtualMiB'];
const blocked = reason => ({ status: 'blocked', reason });

export function assessReleaseMemory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length ||
      fields.some(key=>!Object.hasOwn(value,key)||!Number.isSafeInteger(value[key])||value[key]<0) ||
      value.totalPhysicalMiB===0 || value.totalVirtualMiB===0 ||
      value.physicalMiB>value.totalPhysicalMiB || value.virtualMiB>value.totalVirtualMiB)
    return blocked('invalid-memory-sample');
  const sample=Object.fromEntries(fields.map(key=>[key,value[key]]));
  if (sample.physicalMiB<RESOURCE_MINIMUM_MIB.physicalMiB ||
      sample.virtualMiB<RESOURCE_MINIMUM_MIB.virtualMiB)
    return { status:'blocked', reason:'insufficient-memory', ...sample };
  return {status:'pass',...sample};
}

export function parseReleaseMemory(raw) {
  if (typeof raw!=='string'||raw.length===0||raw.length>2048)
    return blocked('invalid-memory-sample');
  try {return assessReleaseMemory(JSON.parse(raw));}
  catch {return blocked('invalid-memory-sample');}
}

// WMI reports available physical and virtual memory in KiB. Floor to MiB so
// rounding cannot promote a below-threshold sample. A read failure is not PASS.
const query = "$ErrorActionPreference='Stop';"+
  "$o=Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 5;"+
  "if(@($o).Count -ne 1 -or $null -eq $o.FreePhysicalMemory -or $null -eq $o.FreeVirtualMemory -or $null -eq $o.TotalVisibleMemorySize -or $null -eq $o.TotalVirtualMemorySize){throw 'Memory sample unavailable'};"+
  "[pscustomobject]@{physicalMiB=[math]::Floor($o.FreePhysicalMemory/1024);virtualMiB=[math]::Floor($o.FreeVirtualMemory/1024);totalPhysicalMiB=[math]::Floor($o.TotalVisibleMemorySize/1024);totalVirtualMiB=[math]::Floor($o.TotalVirtualMemorySize/1024)}|ConvertTo-Json -Compress";
export function readReleaseMemory() {
  if(process.platform!=='win32')return blocked('unsupported-release-platform');
  try {
    const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const raw=execFileSync(shell,['-NoProfile','-NonInteractive','-Command',query],
      {encoding:'utf8',windowsHide:true,timeout:12000,maxBuffer:8192,stdio:['ignore','pipe','pipe']});
    return parseReleaseMemory(raw);
  } catch {return blocked('memory-probe-unavailable');}
}
