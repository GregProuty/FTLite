$ErrorActionPreference='Continue'
$evidence='.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence'
$results=@()
$cases=@(
  @{name='internet-driver-loopback';script='internet-app-smoke.ts';args=@('--local-verification','--service-origin=https://ftlite-signalling-dev.gprout009.workers.dev',"--candidate-manifest=$evidence/candidate.json");expected=0},
  @{name='internet-delayed-shutdown';script='internet-app-smoke.ts';args=@('--local-verification','--local-delayed-shutdown','--service-origin=https://ftlite-signalling-dev.gprout009.workers.dev',"--candidate-manifest=$evidence/candidate.json");expected=0},
  @{name='online-app';script='online-app-smoke.ts';args=@();expected=0},
  @{name='native-config';script='rtc-config-smoke.ts';args=@();expected=0},
  @{name='recovery-unresponsive-cleanup';script='online-recovery-smoke.ts';args=@('--inject-unresponsive-cleanup');expected=1}
)
foreach($case in $cases) {
  $argv=@("scripts/network/$($case.script)")+$case.args+@("--report-path=$evidence/$($case.name).json")
  & node node_modules/tsx/dist/cli.mjs @argv *> "$evidence/$($case.name).txt"
  $code=$LASTEXITCODE
  $results+=@{command="node node_modules/tsx/dist/cli.mjs $($argv -join ' ')";exitCode=$code;expectedExit=$case.expected}
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 "$evidence/native-commands.json"
  Write-Output "$($case.name) EXIT=$code"
  if($code -ne $case.expected){exit 1}
}
