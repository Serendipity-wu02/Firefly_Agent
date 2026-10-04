// Read-only environment diagnosis: DNS lookup only, never TCP, certificates or settings mutation.
const fs = require('node:fs'), path = require('node:path'), dns = require('node:dns/promises');
const { X509Certificate, createHash } = require('node:crypto');
const { isPublicNetworkAddress } = require('E:/Codex/2026-10-04/task-4/audit-r3-r4/dist/main/main/browser/public-network-target.js');
const output=path.join(__dirname,'tls-dns-diagnosis-r1.json');
if(fs.existsSync(output))throw Error('Do not overwrite evidence');
(async()=>{
  const certBytes=fs.readFileSync(path.join(__dirname,'tls-cert.pem')),cert=new X509Certificate(certBytes);
  const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'epoch-evidence-green-r4.json'),'utf8'));
  const result={baseline:'9e7c6a3cc51d598c7ab8ae8f986405cb9e5d661c',timestamp:new Date().toISOString(),node:process.version,target:'example.com',dns:[],dnsError:null,tcpAttempts:0,certificate:{subject:cert.subject,issuer:cert.issuer,selfIssued:cert.subject===cert.issuer,selfSignatureValid:cert.verify(cert.publicKey),validFrom:cert.validFrom,validTo:cert.validTo,currentlyDateValid:Date.now()>=Date.parse(cert.validFrom)&&Date.now()<=Date.parse(cert.validTo),sha256:createHash('sha256').update(certBytes).digest('hex')},priorNativeChromium:{run:previous.run,versions:previous.versions.electron,certificateErrors:previous.diagnostics.certificates.map(({url,error})=>({url,error})),httpHits:previous.diagnostics.http.length,note:'Only HTTP hit was explicitly verified Node fixture POST. Chromium default certificate rejection retained.'},limits:'Self-signed test leaf is not trusted by default Chromium. No root installed, no certificate verification override, no DNS/network settings change or hardcoded public-address workaround.'};
  try{result.dns=(await dns.lookup('example.com',{all:true})).map(a=>({...a,allowedByUnchangedProduct:isPublicNetworkAddress(a.address)}))}catch(e){result.dnsError={code:e.code,message:e.message}}
  result.publicDnsPermitsDial=result.dns.length>0&&result.dns.every(a=>a.allowedByUnchangedProduct);
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
