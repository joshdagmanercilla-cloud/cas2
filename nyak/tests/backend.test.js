const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, rmSync, readdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

let server, base, temp, dbFile, adminCookie, csrf, reviewerCookie, reviewerCsrf;
const adminPassword='integration-test-password-2026';
async function call(route,{method='GET',body,auth,csrfToken}={}){
  const headers={};if(body!==undefined)headers['content-type']='application/json';if(auth)headers.cookie=auth;if(csrfToken)headers['x-csrf-token']=csrfToken;
  const response=await fetch(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const type=response.headers.get('content-type')||'';const data=type.includes('json')?await response.json():await response.text();return {response,data};
}
async function login(username,password){const x=await call('/api/auth/login',{method:'POST',body:{username,password}});assert.equal(x.response.status,200);return {cookie:x.response.headers.get('set-cookie').split(';')[0],csrf:x.data.csrfToken};}

before(async()=>{
  temp=mkdtempSync(path.join(os.tmpdir(),'quiet-barangay-test-'));dbFile=path.join(temp,'test.sqlite');
  const port=32000+Math.floor(Math.random()*12000);base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),stdio:'ignore',env:{...process.env,PORT:String(port),QB_DB:dbFile,QB_UPLOADS:path.join(temp,'uploads'),QB_ADMIN_USER:'admin',QB_ADMIN_PASSWORD:adminPassword,QB_SESSION_SECRET:'integration-test-session-secret'}});
  for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/config');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const ready=await fetch(base+'/api/config');assert.equal(ready.status,200);
  ({cookie:adminCookie,csrf}=await login('admin',adminPassword));
});
after(async()=>{if(server&&!server.killed){const done=once(server,'exit');server.kill();await done;}await new Promise(r=>setTimeout(r,100));if(temp)rmSync(temp,{recursive:true,force:true});});

test('submission, normalization, duplicate review, privacy and monthly/annual counts',async()=>{
  const cfg=await call('/api/config');assert.equal(cfg.data.barangays.length,65);
  const announcement=await call('/api/admin/announcements',{method:'POST',auth:adminCookie,csrfToken:csrf,body:{title:'Muffler monitoring',body:'Barangay officials are reviewing noise reports this month.'}});assert.equal(announcement.response.status,201);assert.equal((await call('/api/public/announcements')).data.length,1);
  const invalid=await call('/api/reports',{method:'POST',body:{plate:'?',incidentAt:'bad',barangay:'Nowhere'}});assert.equal(invalid.response.status,400);
  const report={plate:'abc-1234',incidentAt:'2026-10-01T00:30',barangay:'San Fermin',location:'Rizal Avenue',category:'Excessively loud muffler',description:'A loud motorcycle passed the corner repeatedly.'};
  const first=await call('/api/reports',{method:'POST',body:report});assert.equal(first.response.status,201);assert.equal(first.data.possibleDuplicate,false);
  const second=await call('/api/reports',{method:'POST',body:{...report,plate:'ABC 1234',description:'A second person heard the loud motorcycle there.'}});assert.equal(second.response.status,201);assert.equal(second.data.possibleDuplicate,true);
  const pub=await call(`/api/reports/track/${first.data.reference}`);assert.equal(pub.response.status,200);assert.equal(pub.data.status,'Pending Review');assert.equal('plate' in pub.data,false);assert.equal('description' in pub.data,false);
  const denied=await call('/api/admin/reports');assert.equal(denied.response.status,401);
  const csrfDenied=await call('/api/officials/reports/'+first.data.reference+'/verification',{method:'PATCH',auth:adminCookie,body:{verificationStatus:'Verified'}});assert.equal(csrfDenied.response.status,403);
  const verified=await call('/api/officials/reports/'+first.data.reference+'/verification',{method:'PATCH',auth:adminCookie,csrfToken:csrf,body:{verificationStatus:'Verified'}});assert.equal(verified.response.status,200);
  const duplicate=await call('/api/officials/reports/'+second.data.reference+'/verification',{method:'PATCH',auth:adminCookie,csrfToken:csrf,body:{verificationStatus:'Duplicate',duplicate:first.data.reference}});assert.equal(duplicate.response.status,200);
  const monthly=await call('/api/officials/analytics/monthly?month=2026-10',{auth:adminCookie});assert.equal(monthly.data[0].plate_number_normalized,'ABC1234');assert.equal(monthly.data[0].total_reports,2);assert.equal(monthly.data[0].unique_incidents,1);assert.equal(monthly.data[0].verified_violations,1);assert.equal(monthly.data[0].duplicate_reports,1);
  const annual=await call('/api/officials/analytics/annual?year=2026',{auth:adminCookie});assert.equal(annual.data.total,2);assert.equal(annual.data.uniqueIncidents,1);assert.equal(annual.data.verified,1);assert.equal(annual.data.duplicates,1);assert.equal(annual.data.months[9].reports,2);
  const db=new DatabaseSync(dbFile);const stored=db.prepare('SELECT plate_number_normalized,incident_month,submitted_month FROM reports WHERE ref=?').get(first.data.reference);assert.equal(stored.plate_number_normalized,'ABC1234');assert.equal(stored.incident_month,'2026-10');assert.ok(stored.submitted_month);db.close();
  const boundary=await call('/api/reports',{method:'POST',body:{plate:'BOUNDARY1',incidentAt:'2026-01-01T00:30',barangay:'Alinam',location:'North Road',category:'Modified exhaust',description:'Incident just after New Year in local time.'}});assert.equal(boundary.response.status,201);const january=await call('/api/officials/analytics/monthly?month=2026-01',{auth:adminCookie});assert.equal(january.data[0].report_month,'2026-01-01');const crossPlate=await call('/api/officials/reports/'+second.data.reference+'/verification',{method:'PATCH',auth:adminCookie,csrfToken:csrf,body:{verificationStatus:'Duplicate',duplicate:boundary.data.reference}});assert.equal(crossPlate.response.status,400);const reversed=await call('/api/officials/reports/'+second.data.reference+'/verification',{method:'PATCH',auth:adminCookie,csrfToken:csrf,body:{verificationStatus:'Unverified'}});assert.equal(reversed.response.status,200);const recalculated=await call('/api/officials/analytics/monthly?month=2026-10',{auth:adminCookie});assert.equal(recalculated.data[0].unique_incidents,2);assert.equal(recalculated.data[0].duplicate_reports,0);
});

test('official roles and concurrent writes remain permission and count safe',async()=>{
  const dirs=await call('/api/admin/barangays',{auth:adminCookie});const sanFermin=dirs.data.find(x=>x.name==='San Fermin');const created=await call('/api/admin/officials',{method:'POST',auth:adminCookie,csrfToken:csrf,body:{fullName:'Read Only Reviewer',username:'readonly',password:'readonly-integration-pass-2026',role:'Read-Only Official',barangayId:sanFermin.id}});assert.equal(created.response.status,201);
  ({cookie:reviewerCookie,csrf:reviewerCsrf}=await login('readonly','readonly-integration-pass-2026'));
  const scoped=await call('/api/admin/reports',{auth:reviewerCookie});assert.equal(scoped.data.total,2);const outside=await call('/api/admin/report?ref='+encodeURIComponent('QB-20260101-NOT-A-REAL-REF'),{auth:reviewerCookie});assert.equal(outside.response.status,404);
  const forbidden=await call('/api/admin/update',{method:'POST',auth:reviewerCookie,csrfToken:reviewerCsrf,body:{reference:'unknown',status:'Verified'}});assert.equal(forbidden.response.status,403);
  const forbiddenAnnouncement=await call('/api/admin/announcements',{method:'POST',auth:reviewerCookie,csrfToken:reviewerCsrf,body:{title:'Unauthorized',body:'This should not be publicly announced.'}});assert.equal(forbiddenAnnouncement.response.status,403);
  const incident=new Date(Date.now()-3*86400000).toISOString();
  const reports=await Promise.all(['RACE111','RACE222','RACE333'].map(plate=>call('/api/reports',{method:'POST',body:{plate,incidentAt:incident,barangay:'Alinam',location:'Test Road',category:'Modified exhaust',description:'Concurrent write verification test report.'}})));
  assert.ok(reports.every(x=>x.response.status===201));
  const db=new DatabaseSync(dbFile);const total=db.prepare("SELECT COUNT(*) n FROM reports WHERE plate_number_normalized LIKE 'RACE%'").get().n;assert.equal(total,3);const stats=db.prepare("SELECT COUNT(*) n FROM monthly_plate_statistics WHERE plate_record_id IN (SELECT id FROM plate_records WHERE plate_number_normalized LIKE 'RACE%')").get().n;assert.equal(stats,3);db.close();
  const exported=await call('/api/officials/reports/export',{auth:adminCookie});assert.equal(exported.response.status,200);assert.match(exported.data,/reference|ref/);
});

test('database and evidence backup can be reopened',async()=>{
  const backupRoot=path.join(temp,'backups');const run=spawnSync(process.execPath,['scripts/backup.js'],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:{...process.env,QB_DB:dbFile,QB_UPLOADS:path.join(temp,'uploads'),QB_BACKUP_DIR:backupRoot}});assert.equal(run.status,0,run.stderr);
  const dir=path.join(backupRoot,readdirSync(backupRoot)[0]),copy=new DatabaseSync(path.join(dir,'quiet-barangay.sqlite'));const rows=copy.prepare('SELECT COUNT(*) n FROM reports').get().n;assert.ok(rows>=6);copy.close();
});
