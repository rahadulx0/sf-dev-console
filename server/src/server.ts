import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CliError, CliRunner } from './cli/CliRunner.js';
import { appHome, initStorage, readState, workspace, writeState } from './storage.js';
import { buildManifest } from './manifest.js';
import type { SavedSet, Selection, SfOrg } from './types.js';

const app = Fastify({ logger: true, bodyLimit: 2_000_000 });
const cli = new CliRunner();
await app.register(cors, { origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] });
await initStorage();

const safeOrg = (value: unknown) => {
  if (typeof value !== 'string' || !/^[\w.@+:-]{1,255}$/.test(value)) throw new Error('Invalid org identifier');
  return value;
};
const safeType = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value)) throw new Error('Invalid metadata type');
  return value;
};
const safeId = (value: unknown, label = 'identifier') => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{5,30}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};
const safeUuid = (value: unknown) => { if(typeof value!=='string'||!/^[0-9a-f-]{36}$/i.test(value))throw new Error('Invalid local job ID');return value; };
const cliFieldValue = (value: unknown) => {
  if (value === null) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value !== 'string' || value.length > 131_072) throw new Error('Invalid field value');
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', ' ').replaceAll('\n', '\\n')}'`;
};
const safeProjectSource = async (projectPath: unknown, sourcePath: unknown) => {
  if (typeof projectPath !== 'string' || typeof sourcePath !== 'string') throw new Error('Project and source paths are required');
  const project = path.resolve(projectPath); const source = path.resolve(project, sourcePath);
  if (source !== project && !source.startsWith(project + path.sep)) throw new Error('Source must be inside the Salesforce project');
  await stat(path.join(project, 'sfdx-project.json')); await stat(source);
  return { project, source };
};
const normalizeOrg = (o: any): SfOrg => ({ alias: o.alias, username: o.username, orgId: o.orgId, instanceUrl: o.instanceUrl, isSandbox: o.isSandbox, connectedStatus: o.connectedStatus, isDefaultUsername: o.isDefaultUsername });

app.setErrorHandler((error, _request, reply) => {
  const status = error instanceof CliError ? 502 : (error as any).statusCode || 400;
  reply.status(status).send({ error: error instanceof Error ? error.message : String(error), details: error instanceof CliError ? error.details : undefined });
});
app.addHook('onResponse', async (request, reply) => {
  if (!request.url.startsWith('/api/') || request.url === '/api/activities' || request.url === '/api/system/status') return;
  const state = await readState(); const operation = request.routeOptions.url || request.url.split('?')[0];
  state.activities = [{ id: randomUUID(), operation, method: request.method, statusCode: reply.statusCode, createdAt: new Date().toISOString() }, ...(state.activities || [])].slice(0, 100);
  await writeState(state);
});

app.get('/api/system/status', async () => {
  try { const version = await cli.version(); return { cli: { installed: true, version }, node: process.version, storage: appHome }; }
  catch (e) { return { cli: { installed: false, error: e instanceof Error ? e.message : String(e) }, node: process.version, storage: appHome }; }
});
app.get('/api/orgs', async () => {
  const result = await cli.execute(['org', 'list']);
  const orgs = [...(result.nonScratchOrgs || []), ...(result.scratchOrgs || [])].map(normalizeOrg);
  return { orgs, selectedOrg: (await readState()).selectedOrg };
});
app.post<{Body:{org:string}}>('/api/orgs/select', async (req) => { const state = await readState(); state.selectedOrg = safeOrg(req.body.org); await writeState(state); return { selectedOrg: state.selectedOrg }; });
app.post<{Body:{environment:'production'|'sandbox',alias?:string,setDefault?:boolean,setDevHub?:boolean,browser?:string}}>('/api/orgs/authorize', async (req) => { const environment=req.body.environment;if(!['production','sandbox'].includes(environment))throw new Error('Choose Production or Sandbox');const args=['org','login','web','--instance-url',environment==='sandbox'?'https://test.salesforce.com':'https://login.salesforce.com'];if(req.body.alias){if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(req.body.alias))throw new Error('Alias must start with a letter and contain only letters, numbers, hyphens, or underscores');args.push('--alias',req.body.alias)}if(req.body.setDefault)args.push('--set-default');if(req.body.setDevHub)args.push('--set-default-dev-hub');if(req.body.browser){if(!['chrome','edge','firefox'].includes(req.body.browser))throw new Error('Unsupported browser');args.push('--browser',req.body.browser)}await cli.execute(args,{timeoutMs:10*60_000});return {authorized:true}; });
app.get<{Params:{org:string}}>('/api/orgs/:org/info', async (req) => {
  const result = await cli.execute(['org', 'display', '--target-org', safeOrg(req.params.org)]);
  return { id: result.id, username: result.username, instanceUrl: result.instanceUrl, connectedStatus: result.connectedStatus, apiVersion: result.apiVersion, alias: result.alias };
});
app.post<{Params:{org:string}}>('/api/orgs/:org/open', async (req) => { await cli.execute(['org', 'open', '--target-org', safeOrg(req.params.org)]); return { ok: true }; });
app.get<{Params:{org:string}}>('/api/orgs/:org/limits', async (req) => cli.execute(['limits', 'api', 'display', '--target-org', safeOrg(req.params.org)]));
app.get<{Params:{org:string}}>('/api/orgs/:org/packages', async (req) => ({ packages: await cli.execute(['package', 'installed', 'list', '--target-org', safeOrg(req.params.org)]) }));
app.get<{Params:{org:string}}>('/api/orgs/:org/logs', async (req) => ({ logs: await cli.execute(['apex', 'list', 'log', '--target-org', safeOrg(req.params.org)]) }));
app.get<{Params:{org:string,id:string}}>('/api/orgs/:org/logs/:id', async (req) => ({ log: await cli.execute(['apex', 'get', 'log', '--log-id', safeId(req.params.id, 'log ID'), '--target-org', safeOrg(req.params.org)]) }));
app.get<{Params:{org:string}}>('/api/orgs/:org/metadata/types', async (req) => {
  const result = await cli.execute(['org', 'list', 'metadata-types', '--target-org', safeOrg(req.params.org)], { timeoutMs: 180_000 });
  return { types: (result.metadataObjects || result || []).map((m:any) => ({ name: m.xmlName || m.name, directoryName: m.directoryName, suffix: m.suffix })).filter((m:any) => m.name) };
});
app.get<{Params:{org:string,type:string}}>('/api/orgs/:org/metadata/:type', async (req) => {
  const result = await cli.execute(['org', 'list', 'metadata', '--metadata-type', safeType(req.params.type), '--target-org', safeOrg(req.params.org)], { timeoutMs: 180_000 });
  return { components: (Array.isArray(result) ? result : result.metadata || []).map((m:any) => ({ fullName: m.fullName, type: m.type, namespacePrefix: m.namespacePrefix })).filter((m:any) => m.fullName) };
});
app.post<{Body:{selections:Selection[],apiVersion?:string}}>('/api/manifests/preview', async (req) => ({ xml: buildManifest(req.body.selections, req.body.apiVersion) }));
app.post<{Body:{name?:string,xml:string}}>('/api/manifests/upload', async (req) => { const xml=req.body.xml?.trim();if(!xml||xml.length>1_000_000||!/<Package\b[^>]*xmlns=["']http:\/\/soap\.sforce\.com\/2006\/04\/metadata["'][^>]*>/i.test(xml)||!/<version>[^<]+<\/version>/i.test(xml))throw new Error('Invalid Salesforce package.xml');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DOCTYPE and entities are not allowed');const id=randomUUID();const dir=path.join(workspace,'manifest','uploaded');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,`${id}.xml`),xml);return {id,name:(req.body.name||'package.xml').slice(0,100),size:Buffer.byteLength(xml)}; });
app.post<{Body:{org:string}}>('/api/retrievals/preview', async (req) => cli.execute(['project','retrieve','preview','--target-org',safeOrg(req.body.org),'--concise'],{cwd:workspace,timeoutMs:5*60_000}));
app.post<{Body:{org:string,orgLabel?:string,manifestId:string}}>('/api/retrievals/from-manifest', async (req,reply) => { const org=safeOrg(req.body.org);const manifestId=safeUuid(req.body.manifestId);const uploaded=path.join(workspace,'manifest','uploaded',`${manifestId}.xml`);await stat(uploaded);const id=randomUUID();const outputDir=path.join(workspace,'retrieve',id);await mkdir(outputDir,{recursive:true});const record={id,org,orgLabel:req.body.orgLabel||org,createdAt:new Date().toISOString(),status:'running' as const,selections:[],componentCount:0,manifestPath:uploaded,outputPath:path.join(outputDir,'metadata.zip')};const state=await readState();state.retrievals.unshift(record);await writeState(state);void(async()=>{try{await cli.execute(['project','retrieve','start','--manifest',uploaded,'--target-org',org,'--target-metadata-dir',outputDir,'--zip-file-name','metadata.zip'],{timeoutMs:30*60_000,cwd:workspace});const s=await readState();const r=s.retrievals.find(x=>x.id===id);if(r)r.status='success';await writeState(s)}catch(e){const s=await readState();const r=s.retrievals.find(x=>x.id===id);if(r){r.status='failed';r.error=e instanceof Error?e.message:String(e)}await writeState(s)}})();return reply.status(202).send(record); });
app.get('/api/retrievals', async () => ({ retrievals: (await readState()).retrievals }));
app.get('/api/activities', async () => ({ activities: (await readState()).activities || [] }));
app.post<{Body:{org:string,orgLabel?:string,selections:Selection[],apiVersion?:string}}>('/api/retrievals', async (req, reply) => {
  const org = safeOrg(req.body.org); const id = randomUUID(); const manifestDir = path.join(workspace, 'manifest', id); const outputDir = path.join(workspace, 'retrieve', id);
  await mkdir(manifestDir, { recursive: true }); await mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'package.xml'); await writeFile(manifestPath, buildManifest(req.body.selections, req.body.apiVersion));
  const record = { id, org, orgLabel: req.body.orgLabel || org, createdAt: new Date().toISOString(), status: 'running' as const, selections: req.body.selections, componentCount: req.body.selections.reduce((n,s) => n + s.members.length, 0), manifestPath, outputPath: path.join(outputDir, 'metadata.zip') };
  const state = await readState(); state.retrievals.unshift(record); await writeState(state);
  void (async () => {
    try { await cli.execute(['project','retrieve','start','--manifest',manifestPath,'--target-org',org,'--target-metadata-dir',outputDir,'--zip-file-name','metadata.zip'], { timeoutMs: 30 * 60_000, cwd: workspace }); const s=await readState(); const r=s.retrievals.find(x=>x.id===id); if(r) r.status='success'; await writeState(s); }
    catch(e) { const s=await readState(); const r=s.retrievals.find(x=>x.id===id); if(r){r.status='failed';r.error=e instanceof Error?e.message:String(e)} await writeState(s); }
  })();
  return reply.status(202).send(record);
});
app.get<{Params:{id:string}}>('/api/retrievals/:id/download', async (req, reply) => { const r=(await readState()).retrievals.find(x=>x.id===req.params.id); if(!r?.outputPath) return reply.code(404).send({error:'Download not found'}); return reply.type('application/zip').header('Content-Disposition',`attachment; filename="${r.orgLabel}-metadata.zip"`).send(await readFile(r.outputPath)); });
app.get('/api/saved-sets', async () => ({ savedSets: (await readState()).savedSets }));
app.post<{Body:{name:string,selections:Selection[]}}>('/api/saved-sets', async (req) => { if(!req.body.name?.trim()) throw new Error('Name is required'); const set:SavedSet={id:randomUUID(),name:req.body.name.trim().slice(0,80),createdAt:new Date().toISOString(),selections:req.body.selections}; const s=await readState();s.savedSets.unshift(set);await writeState(s);return set; });
app.delete<{Params:{id:string}}>('/api/saved-sets/:id', async (req) => { const s=await readState();s.savedSets=s.savedSets.filter(x=>x.id!==req.params.id);await writeState(s);return {ok:true}; });
app.post<{Body:{org:string,query:string,tooling?:boolean}}>('/api/query', async (req) => { if(!req.body.query?.trim() || req.body.query.length>100_000) throw new Error('Invalid query'); const args=['data','query','--query',req.body.query,'--target-org',safeOrg(req.body.org)];if(req.body.tooling)args.push('--use-tooling-api'); return cli.execute(args,{timeoutMs:180_000}); });
app.post<{Body:{org:string,sobject:string,recordId:string,tooling?:boolean}}>('/api/data/record', async (req) => { const args=['data','get','record','--sobject',safeType(req.body.sobject),'--record-id',safeId(req.body.recordId,'record ID'),'--target-org',safeOrg(req.body.org)];if(req.body.tooling)args.push('--use-tooling-api');return cli.execute(args,{timeoutMs:120_000}); });
app.post<{Body:{org:string,sobject:string,recordId:string,changes:Record<string,unknown>,tooling?:boolean}}>('/api/data/record/update', async (req) => { const org=safeOrg(req.body.org),sobject=safeType(req.body.sobject),recordId=safeId(req.body.recordId,'record ID');const entries=Object.entries(req.body.changes||{}).slice(0,100);if(!entries.length)throw new Error('Change at least one field before saving');const describeArgs=['sobject','describe','--sobject',sobject,'--target-org',org];if(req.body.tooling)describeArgs.push('--use-tooling-api');const describe=await cli.execute(describeArgs,{timeoutMs:120_000});const updateable=new Set((describe.fields||[]).filter((f:any)=>f.updateable).map((f:any)=>f.name));for(const [field] of entries)if(!updateable.has(field))throw new Error(`${field} is not updateable for this user`);const values=entries.map(([field,value])=>`${safeType(field)}=${cliFieldValue(value)}`).join(' ');const args=['data','update','record','--sobject',sobject,'--record-id',recordId,'--values',values,'--target-org',org];if(req.body.tooling)args.push('--use-tooling-api');return cli.execute(args,{timeoutMs:120_000}); });
app.post<{Body:{org:string,sobject:string,recordIds:string[],confirmation:string,tooling?:boolean}}>('/api/data/records/delete', async (req) => { const org=safeOrg(req.body.org),sobject=safeType(req.body.sobject);const recordIds=[...new Set(req.body.recordIds||[])].slice(0,50).map(id=>safeId(id,'record ID'));if(!recordIds.length)throw new Error('Select at least one record');const expected=`DELETE ${recordIds.length} RECORDS FROM ${sobject}`;if(req.body.confirmation!==expected)throw new Error(`Confirmation must exactly match: ${expected}`);const deleted:string[]=[];const failed:{id:string,error:string}[]=[];for(const id of recordIds){try{const args=['data','delete','record','--sobject',sobject,'--record-id',id,'--target-org',org];if(req.body.tooling)args.push('--use-tooling-api');await cli.execute(args,{timeoutMs:120_000});deleted.push(id)}catch(e){failed.push({id,error:e instanceof Error?e.message:String(e)})}}return {deleted,failed}; });
app.get<{Params:{org:string};Querystring:{category?:string,tooling?:string}}>('/api/orgs/:org/objects', async (req) => { const org=safeOrg(req.params.org);if(req.query.tooling==='true'){const result=await cli.execute(['data','query','--query','SELECT QualifiedApiName FROM EntityDefinition ORDER BY QualifiedApiName','--target-org',org,'--use-tooling-api'],{timeoutMs:120_000});return {objects:(result.records||[]).map((record:any)=>record.QualifiedApiName).filter(Boolean)}}const category=['all','standard','custom'].includes((req.query.category||'').toLowerCase())?req.query.category!.toLowerCase():'all';return {objects:await cli.execute(['sobject','list','--sobject',category,'--target-org',org])}; });
app.get<{Params:{org:string,name:string};Querystring:{tooling?:string}}>('/api/orgs/:org/objects/:name', async (req) => {const args=['sobject','describe','--sobject',safeType(req.params.name),'--target-org',safeOrg(req.params.org)];if(req.query.tooling==='true')args.push('--use-tooling-api');return {describe:await cli.execute(args,{timeoutMs:120_000})};});
app.post<{Body:{org:string,objects:string[]}}>('/api/data/record-counts', async (req) => { const objects=(req.body.objects||[]).slice(0,25).map(x=>safeType(x));if(!objects.length)throw new Error('Select at least one object');const counts=await Promise.all(objects.map(async object=>{const result=await cli.execute(['data','query','--query',`SELECT count() FROM ${object}`,'--target-org',safeOrg(req.body.org)],{timeoutMs:120_000});return {object,count:result.totalSize??result.records?.[0]?.expr0??0}}));return {counts}; });
app.post<{Body:{org:string,code:string}}>('/api/apex/execute', async (req) => { if(!req.body.code?.trim() || req.body.code.length>500_000) throw new Error('Invalid Apex'); return cli.execute(['apex','run','--target-org',safeOrg(req.body.org)],{stdin:req.body.code,timeoutMs:180_000}); });
app.post<{Body:{org:string,testLevel:string,tests?:string[],coverage?:boolean}}>('/api/tests', async (req) => { const allowed=['RunLocalTests','RunAllTestsInOrg','RunSpecifiedTests'];if(!allowed.includes(req.body.testLevel))throw new Error('Invalid test level');const args=['apex','run','test','--target-org',safeOrg(req.body.org),'--test-level',req.body.testLevel,'--wait','20'];if(req.body.testLevel==='RunSpecifiedTests'){const tests=(req.body.tests||[]).filter(x=>/^[A-Za-z0-9_.]+$/.test(x));if(!tests.length)throw new Error('Select at least one test');args.push('--tests',tests.join(','));}if(req.body.coverage)args.push('--code-coverage');return cli.execute(args,{timeoutMs:25*60_000}); });
app.post<{Body:{org:string,projectPath:string,sourcePath:string}}>('/api/deploy/preview', async (req) => { const p=await safeProjectSource(req.body.projectPath,req.body.sourcePath);return cli.execute(['project','deploy','preview','--source-dir',p.source,'--target-org',safeOrg(req.body.org),'--concise'],{cwd:p.project,timeoutMs:5*60_000}); });
app.post<{Body:{org:string,projectPath:string,sourcePath:string,testLevel?:string}}>('/api/deploy/validate', async (req) => { const p=await safeProjectSource(req.body.projectPath,req.body.sourcePath);const levels=['NoTestRun','RunSpecifiedTests','RunLocalTests','RunAllTestsInOrg'];const level=levels.includes(req.body.testLevel||'')?req.body.testLevel!:'RunLocalTests';return cli.execute(['project','deploy','validate','--source-dir',p.source,'--target-org',safeOrg(req.body.org),'--test-level',level,'--wait','30'],{cwd:p.project,timeoutMs:35*60_000}); });
app.post<{Body:{org:string,projectPath:string,sourcePath:string,testLevel?:string,confirmation:string}}>('/api/deploy/start', async (req) => { const org=safeOrg(req.body.org);if(req.body.confirmation!==`DEPLOY ${org}`)throw new Error(`Confirmation must exactly match: DEPLOY ${org}`);const p=await safeProjectSource(req.body.projectPath,req.body.sourcePath);const levels=['NoTestRun','RunLocalTests','RunAllTestsInOrg','RunRelevantTests'];const level=levels.includes(req.body.testLevel||'')?req.body.testLevel!:'RunLocalTests';return cli.execute(['project','deploy','start','--source-dir',p.source,'--target-org',org,'--test-level',level,'--async'],{cwd:p.project,timeoutMs:120_000}); });
app.get<{Params:{org:string,id:string}}>('/api/deploy/:org/:id', async (req) => cli.execute(['project','deploy','report','--job-id',safeId(req.params.id,'deployment ID'),'--target-org',safeOrg(req.params.org)],{timeoutMs:120_000}));
app.post<{Body:{org:string,jobId:string,confirmation:string}}>('/api/deploy/quick', async (req) => { const org=safeOrg(req.body.org),job=safeId(req.body.jobId,'deployment ID');if(req.body.confirmation!==`QUICK DEPLOY ${job}`)throw new Error(`Confirmation must exactly match: QUICK DEPLOY ${job}`);return cli.execute(['project','deploy','quick','--job-id',job,'--target-org',org,'--async'],{timeoutMs:120_000}); });
app.post<{Body:{org:string,jobId:string}}>('/api/deploy/cancel', async (req) => cli.execute(['project','deploy','cancel','--job-id',safeId(req.body.jobId,'deployment ID'),'--target-org',safeOrg(req.body.org),'--async'],{timeoutMs:120_000}));

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
try { await app.register(staticPlugin, { root: webDist }); app.setNotFoundHandler((req, reply) => req.url.startsWith('/api/') ? reply.code(404).send({error:'Not found'}) : reply.sendFile('index.html')); } catch {}
const port = Number(process.env.PORT || 4173); await app.listen({ host: '127.0.0.1', port });
