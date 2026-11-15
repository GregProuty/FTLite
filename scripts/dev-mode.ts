// `npm run dev:flight` (H-1 spec §3): runs `electron-vite dev` with FTLITE_MODE set, the same on Windows and elsewhere
// (npm scripts cannot set an environment variable portably without a dependency).
import { spawn } from 'node:child_process';

const mode = process.argv[2];
if (!mode) { console.error('usage: tsx scripts/dev-mode.ts <mode>'); process.exit(2); }
const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', shell: true, env: { ...process.env, FTLITE_MODE: mode } });
child.on('exit', (code) => process.exit(code ?? 1));
