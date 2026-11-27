// Windows-only recovery for a launcher-bound disposable Chrome profile.
// No shell interpolation of paths; never emit process command lines.
// Process ID alone is not ownership: parse exact argv, match executable,
// and verify creation time and image on a pinned OS handle before termination.
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const recoveryScript = String.raw`
$ErrorActionPreference='Stop'
$profile=$env:BF_OWNED_CHROME_PROFILE
$exe=$env:BF_OWNED_CHROME_EXE
$name=[IO.Path]::GetFileName($exe)
if($name -notin @('chrome.exe','chromium.exe') -or -not [IO.Path]::IsPathRooted($profile) -or -not [IO.Path]::IsPathRooted($exe)){throw 'Invalid owned process scope'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class BfOwnedChromeNative {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CommandLineToArgvW(string cmd,out int argc);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool GetProcessTimes(IntPtr h,out long created,out long exited,out long kernel,out long user);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool QueryFullProcessImageName(IntPtr h,int flags,StringBuilder name,ref int length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr h,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h,uint ms);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string[] Args(string command) {
    int count; IntPtr pointer=CommandLineToArgvW(command,out count);
    if(pointer==IntPtr.Zero)throw new InvalidOperationException("argv unavailable");
    try {
      string[] result=new string[count];
      for(int i=0;i<count;i++)result[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer,i*IntPtr.Size));
      return result;
    }finally{LocalFree(pointer);}
  }
  public static bool Reap(int pid,long creation,string executable) {
    // SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE
    IntPtr h=OpenProcess(0x00101001,false,pid);
    if(h==IntPtr.Zero) {
      // ERROR_INVALID_PARAMETER: PID may already have exited; final enumeration verifies.
      if(Marshal.GetLastWin32Error()==87)return false;
      throw new InvalidOperationException("owned handle unavailable");
    }
    try {
      if(WaitForSingleObject(h,0)==0)return false;
      long actual,exited,kernel,user;
      if(!GetProcessTimes(h,out actual,out exited,out kernel,out user))
        throw new InvalidOperationException("creation time unavailable");
      // CIM timestamps have microsecond precision, FILETIME uses 100 ns ticks.
      if(Math.Abs(actual-creation)>10)throw new InvalidOperationException("process creation mismatch");
      StringBuilder image=new StringBuilder(32768);int length=image.Capacity;
      if(!QueryFullProcessImageName(h,0,image,ref length)||
        !String.Equals(image.ToString(),executable,StringComparison.OrdinalIgnoreCase))
        throw new InvalidOperationException("process image mismatch");
      if(!TerminateProcess(h,1)) {
        if(WaitForSingleObject(h,0)==0)return false;
        throw new InvalidOperationException("owned termination failed");
      }
      if(WaitForSingleObject(h,3000)!=0)throw new InvalidOperationException("owned exit unconfirmed");
      return true;
    }finally{CloseHandle(h);}
  }
}
'@
function Find-Owned {
  foreach($p in @(Get-CimInstance Win32_Process -Filter ("Name='"+$name+"'") -OperationTimeoutSec 5)) {
    if(-not $p.CommandLine) {
      if(-not $p.ExecutablePath -or [string]::Equals($p.ExecutablePath,$exe,[StringComparison]::OrdinalIgnoreCase)){
        throw 'Chrome process scope uninspectable'
      }
      continue
    }
    $argv=[BfOwnedChromeNative]::Args($p.CommandLine)
    $profileArgs=@()
    for($i=1;$i -lt $argv.Length;$i++){
      $arg=$argv[$i]
      if($arg -ieq '--user-data-dir'){
        $profileArgs+= $(if($i+1 -lt $argv.Length){$argv[$i+1]}else{''})
      }elseif($arg.StartsWith('--user-data-dir=',[StringComparison]::OrdinalIgnoreCase)){
        $profileArgs+= $arg.Substring('--user-data-dir='.Length)
      }
    }
    $exact=@($profileArgs | Where-Object {[string]::Equals($_,$profile,[StringComparison]::OrdinalIgnoreCase)})
    if($exact.Count -eq 0){continue}
    if($exact.Count -ne 1 -or $profileArgs.Count -ne 1 -or
       -not [string]::Equals($p.ExecutablePath,$exe,[StringComparison]::OrdinalIgnoreCase) -or -not $p.CreationDate){
      throw 'Ambiguous exact-profile process'
    }
    [pscustomobject]@{Pid=[int]$p.ProcessId;Created=[long]$p.CreationDate.ToUniversalTime().ToFileTimeUtc()}
  }
}
$before=@(Find-Owned)
if($before.Count -gt 64){throw 'Owned process count exceeds bounded recovery'}
$terminated=0
foreach($p in $before){
  if([BfOwnedChromeNative]::Reap($p.Pid,$p.Created,$exe)){$terminated++}
}
$after=@(Find-Owned)
if($after.Count -ne 0){throw 'Owned processes remain'}
[Console]::WriteLine((@{before=$before.Count;terminated=$terminated;remaining=$after.Count}|ConvertTo-Json -Compress))
`;

export async function recoverWindowsChrome(profile, executable) {
  if (process.platform !== 'win32') throw Error('Windows recovery unavailable');
  // Defense in depth for the internal native adapter, not an arbitrary PID API.
  const tmp=fs.realpathSync.native(os.tmpdir());
  if(typeof profile!=='string'||!path.isAbsolute(profile)||!/^bf-[a-z0-9-]+-[A-Za-z0-9]{6}$/.test(path.basename(profile))||
    path.dirname(profile).toLowerCase()!==tmp.toLowerCase())throw Error('Invalid disposable recovery profile');
  const stat=fs.lstatSync(profile);
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync.native(profile).toLowerCase()!==profile.toLowerCase())
    throw Error('Invalid disposable recovery profile');
  const exe=fs.realpathSync.native(executable);
  if (!['chrome.exe','chromium.exe'].includes(path.basename(exe).toLowerCase()))
    throw Error('Unsupported Chrome executable for recovery');
  const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const result=await new Promise((resolve,reject)=>{
    execFile(shell,['-NoProfile','-NonInteractive','-Command',recoveryScript],{
      windowsHide:true,timeout:25000,maxBuffer:16384,
      env:{...process.env,BF_OWNED_CHROME_PROFILE:profile,BF_OWNED_CHROME_EXE:exe},
    },(error,stdout)=>{
      // Native errors may contain process or profile paths.
      if(error){reject(Error('Exact-profile Windows recovery failed'));return}
      try{resolve(JSON.parse(stdout))}catch{reject(Error('Invalid Windows recovery receipt'))}
    });
  });
  if(!result||!Number.isInteger(result.before)||result.before<0||result.before>64||
    !Number.isInteger(result.terminated)||result.terminated<0||result.terminated>result.before||result.remaining!==0)
    throw Error('Windows recovery postcondition unverified');
  return result;
}
