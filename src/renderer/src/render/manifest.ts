import { z } from 'zod';
import { LICENSES, OWNER_AUTHOR, licenseAllowed } from './licenses';

const animation = z.object({ frames: z.array(z.number().int().min(0)).min(1), fps: z.number().positive(), loop: z.boolean() });
const sheet = z.object({
  frameW: z.number().int().positive(), frameH: z.number().int().positive(),
  frames: z.record(z.string().min(1), z.number().int().min(0)).default({}),
  animations: z.record(z.string().min(1), animation).default({})
});
const nineSlice = z.object({ left: z.number().int().min(0), top: z.number().int().min(0), right: z.number().int().min(0), bottom: z.number().int().min(0) });

const entry = z.object({
  file: z.string().regex(/^(raw|art)\/[^\s]+$/, 'file must be a path under raw/ or art/ (relative to public/assets)'),
  title: z.string().min(1), author: z.string().min(1), source: z.string().min(1),
  archived: z.string().url().optional(),
  license: z.enum(LICENSES, { errorMap: () => ({ message: `license must be one of ${LICENSES.join(', ')}` }) }),
  licenseUrl: z.string().url().optional(),
  /** Path under public/assets of a licence text to append verbatim to the notices (required for OFL fonts). */
  licenseFile: z.string().optional(),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  modifications: z.string().min(1).default('none'),
  editedBy: z.string().min(1).optional(),
  credit: z.string().min(1).optional(),
  required: z.boolean().default(true),
  name: z.string().min(1).optional(),
  sheet: sheet.optional(),
  nineSlice: nineSlice.optional()
}).superRefine((e, ctx) => {
  const fail = (message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${e.file}: ${message}` }); };
  if ((e.name === undefined) === (e.sheet === undefined)) fail('exactly one of name or sheet is required');
  if (!licenseAllowed(e.license, e.modifications)) fail(`CC-BY-SA is allowed only with modifications "none" (license ${e.license})`);
  if (e.license.startsWith('CC-BY')) { if (!e.credit) fail('CC-BY entries need a credit line'); if (!e.archived) fail('CC-BY entries need an archived URL'); }
  if (e.license === 'OFL-1.1' && !e.licenseFile) fail('OFL entries need licenseFile (the OFL text to ship)');
  if (e.license === 'original') {
    if (e.author !== OWNER_AUTHOR) fail(`original pieces must name ${OWNER_AUTHOR} as author`);
    if (e.source !== 'assets/art') fail('original pieces must use source "assets/art"');
    if (e.archived) fail('original pieces have no archived URL');
    if (!e.file.startsWith('art/')) fail('original pieces live under art/');
  } else if (e.file.startsWith('art/')) {
    // A derived file: an edit of a third-party asset keeps that asset's provenance and records the edit.
    if (e.modifications === 'none') fail('derived art/ files must describe their modifications');
    if (!e.editedBy) fail('derived art/ files must name editedBy');
  }
});

const manifest = z.array(entry).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const e of all) { if (seen.has(e.file)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${e.file}: listed twice` }); seen.add(e.file); }
});

export type ManifestEntry = z.infer<typeof entry>;
export type Manifest = ManifestEntry[];

export function parseManifest(json: unknown): Manifest {
  const r = manifest.safeParse(json);
  if (!r.success) throw new Error('Invalid asset manifest: ' + r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

/** Names an entry binds: its single name, or its sheet's static frames then animations. */
export function boundNames(e: ManifestEntry): string[] {
  if (e.name !== undefined) return [e.name];
  return [...Object.keys(e.sheet!.frames), ...Object.keys(e.sheet!.animations)];
}
