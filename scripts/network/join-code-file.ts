/** The room code alphabet (src/shared/roomSession.ts joinCode): Crockford base 32, without I, L, O and U. */
const JOIN_CODE=/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
/** A two-machine guest's room code from the file its operator saved, or '' while it is not (yet) a whole code.
 *  Accepts UTF-8 (with or without a BOM) and UTF-16LE with a BOM (Windows PowerShell 5.1's `>` and Out-File),
 *  a leading `ROOM `, lower case, and the look-alikes the alphabet leaves out (O for 0, I and L for 1). */
export function parseJoinCodeFile(bytes:Uint8Array):string {
  const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=b[0]===0xff&&b[1]===0xfe?b.subarray(2).toString('utf16le'):b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf?b.subarray(3).toString('utf8'):b.toString('utf8');
  const code=text.trim().toUpperCase().replace(/^ROOM\s+/,'').replace(/O/g,'0').replace(/[IL]/g,'1');
  return JOIN_CODE.test(code)?code:'';
}
