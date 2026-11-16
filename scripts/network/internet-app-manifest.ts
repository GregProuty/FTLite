import { resolveOnlineConfig } from '../../src/main/network/onlineConfig';

export function isCanonicalServiceOrigin(value:unknown):value is string {
  if(typeof value!=='string')return false;
  const config=resolveOnlineConfig({packaged:false,serviceUrl:value});
  return config.enabled&&config.baseUrl===value;
}
/** Read the compiled anchor only after validating both manifest origin fields. */
export function assertCandidateServiceOrigin(manifest:unknown,requestedOrigin:string,compiledMain:string|(()=>string)):void {
  try {
    const value=manifest as any,origin=value?.identity?.serviceOrigin;
    if(!isCanonicalServiceOrigin(origin)||value.serviceOrigin!==origin||requestedOrigin!==origin)throw Error();
    const source=typeof compiledMain==='function'?compiledMain():compiledMain;
    const definitions=[...source.matchAll(/packagedServiceOrigin:\s*packaged\s*\?\s*("[^"]*")\s*:\s*void 0/g)];
    if(definitions.length!==1||JSON.parse(definitions[0]![1]!)!==origin)throw Error();
  }catch{throw Error('candidate-origin-invalid');}
}
