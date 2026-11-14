import { computeContentDigest } from '../build/contentDigest';
import { runAcceptance, runAcceptanceCli } from '../src/renderer/src/headless/acceptance';
const contentDigest = computeContentDigest(process.cwd());
runAcceptanceCli(process.argv.slice(2), (args) => runAcceptance({ ...args, contentDigest }));
