// npm run art:stars (Art-v spec section 2): finds the painted stars in the staged Deep Space (Red) PNG, from FTLITE_ASSETS
// (else the owner's folder), and writes art/deep-space-red.stars.json (coordinates only, committed).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, sourceFolder } from './art/importCore';
import { STAR_MAX_SIZE, STAR_THRESHOLD, starsFileText } from './art/findStars';

const SOURCE = '2mt-diver/deep-space-red.png', OUT = 'art/deep-space-red.stars.json';
const img = readPng(join(sourceFolder(process.env), SOURCE));
const text = starsFileText(SOURCE, img, { threshold: STAR_THRESHOLD, maxSize: STAR_MAX_SIZE });
writeFileSync(OUT, text);
console.log(`wrote ${OUT}: ${(JSON.parse(text) as { stars: unknown[] }).stars.length} stars at threshold ${STAR_THRESHOLD}`);
