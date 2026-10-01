import {execFileSync} from 'node:child_process';
const flat=new Set(['earn-snapshot.json','run-status.json','research-references.json','current.json','latest-attempt.json']);
const paths=execFileSync('git',['diff','--cached','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
if(paths.some(p=>!flat.has(p)&&!/^releases\/rel-earn-cloud-[0-9TZ]+\/(earn-snapshot|run-status|research-references|research-index|evidence-index)\.json$/.test(p)))throw Error('NON_PUBLIC_STAGED_PATH');
console.log(JSON.stringify({publicStagedFiles:paths.length}));
