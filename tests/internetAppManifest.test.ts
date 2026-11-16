import { expect,it } from 'vitest';
import { assertCandidateServiceOrigin } from '../scripts/network/internet-app-manifest';
const origin='https://service.example';
const main=`packagedServiceOrigin: packaged ? "${origin}" : void 0`;
const manifest=()=>({serviceOrigin:origin,identity:{serviceOrigin:origin}});
it('binds the manifest, identity and requested origin to compiled main',()=>expect(()=>assertCandidateServiceOrigin(manifest(),origin,main)).not.toThrow());
it.each(['manifest','identity','request','main'])('rejects mismatched %s origin before launch',part=>{
  const m=manifest();let request=origin,code=main;
  if(part==='manifest')m.serviceOrigin='https://other.example';if(part==='identity')m.identity.serviceOrigin='https://other.example';if(part==='request')request='https://other.example';if(part==='main')code=main.replace(origin,'https://other.example');
  expect(()=>assertCandidateServiceOrigin(m,request,code)).toThrow('candidate-origin-invalid');
});
it.each(['https://SERVICE.example','https://service.example/','https://service.example:443','https://user:private@service.example','http://service.example'])('rejects a noncanonical or unsafe intended origin %s',value=>{
  expect(()=>assertCandidateServiceOrigin({serviceOrigin:value,identity:{serviceOrigin:value}},value,main.replace(origin,value))).toThrow('candidate-origin-invalid');
});
it('rejects a relabelled manifest with unchanged embedded origin',()=>expect(()=>assertCandidateServiceOrigin({serviceOrigin:'https://other.example',identity:{serviceOrigin:'https://other.example'}},'https://other.example',main)).toThrow('candidate-origin-invalid'));
it('rejects missing or ambiguous compiled origin anchors',()=>{for(const code of ['',main+'\n'+main])expect(()=>assertCandidateServiceOrigin(manifest(),origin,code)).toThrow('candidate-origin-invalid');});
