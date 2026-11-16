$ErrorActionPreference='Continue'
$evidence='.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence'
$results=@()
foreach($fault in @('git-failure','git-timeout','preparation-read-failure')) {
  $argv=@('scripts/network/online-recovery-smoke.ts',"--inject-$fault","--report-path=$evidence/recovery-$fault.json")
  & node node_modules/tsx/dist/cli.mjs @argv *> "$evidence/recovery-$fault.txt"
  $results+=@{command="node node_modules/tsx/dist/cli.mjs $($argv -join ' ')";exitCode=$LASTEXITCODE;expectedExit=1}
}
$results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 "$evidence/preparation-commands.json"
$results | ConvertTo-Json -Depth 5
