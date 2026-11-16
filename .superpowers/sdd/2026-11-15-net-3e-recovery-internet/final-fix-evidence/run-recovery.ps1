$ErrorActionPreference='Continue'
$evidence='.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence'
$results=@()
foreach($scenario in @('skiff','cutter','paused','upload','race','stale')) {
  $argv=@('scripts/network/online-recovery-smoke.ts',"--scenario=$scenario","--report-path=$evidence/recovery-$scenario.json")
  & node node_modules/tsx/dist/cli.mjs @argv *> "$evidence/recovery-$scenario.txt"
  $results+=@{command="node node_modules/tsx/dist/cli.mjs $($argv -join ' ')";exitCode=$LASTEXITCODE;expectedExit=0}
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 "$evidence/recovery-commands.json"
  Write-Output "$scenario EXIT=$LASTEXITCODE"
  if($LASTEXITCODE -ne 0){exit 1}
}
