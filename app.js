'use strict';
// ---------- IndexedDB ----------
const STORES=['jobs','tools','manuals','files'];let db;
function openDB(){return new Promise((ok,no)=>{const r=indexedDB.open('shop-assistant',1);r.onupgradeneeded=()=>{STORES.forEach(s=>{if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'})})};r.onsuccess=()=>{db=r.result;ok()};r.onerror=()=>no(r.error)})}
const tx=(s,m='readonly')=>db.transaction(s,m).objectStore(s);
const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const all=s=>req(tx(s).getAll()),put=(s,v)=>req(tx(s,'readwrite').put(v)),del=(s,id)=>req(tx(s,'readwrite').delete(id)),get=(s,id)=>req(tx(s).get(id)),clear=s=>req(tx(s,'readwrite').clear());
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
// ---------- Schemas ----------
const TOOL_STATUS={in:'In shop',loaned:'Loaned out',repair:'Needs repair',lost:'Lost'};
const SCHEMA={
 jobs:[['date','Date','date'],['unit','Unit / vehicle'],['customer','Customer / company'],['meter','Mileage / hours'],['complaint','Complaint','area'],['work','Work performed','area'],['parts','Parts','parts'],['labor','Labor hours','number'],['notes','Notes','area'],['status','Status','select',{open:'Open',done:'Done'}]],
 tools:[['name','Tool name'],['brand','Brand'],['category','Category'],['location','Location'],['status','Status','select',TOOL_STATUS],['loanedTo','Loaned to'],['date','Date','date'],['notes','Notes','area']],
 manuals:[['title','Title'],['make','Make'],['model','Model'],['years','Years'],['system','System (engine, brakes, HVAC…)'],['type','Type (service, repair, wiring, parts…)'],['location','Physical copy location'],['link','Link (URL)','url'],['file','PDF or photo attachment','file']]
};
const META={jobs:{icon:'🔧',name:'Job Log',empty:'Log every job: unit, complaint, work done, parts and labor.'},tools:{icon:'🧰',name:'Tool Tracker',empty:'Keep track of where your tools are and who borrowed them.'},manuals:{icon:'📘',name:'Manuals',empty:'Catalog service and repair manuals, paper or digital.'}};
let tab='jobs',q='',filt='';
const $=s=>document.querySelector(s);
// ---------- Render ----------
let rv=0;async function render(){
 const my=++rv,t0=tab;const items=(await all(tab)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.created-a.created);
 if(my!==rv||t0!==tab)return;const m=META[tab];const main=$('#main');
 if(!items.length){main.innerHTML=`<div class="empty"><div class="big">${m.icon}</div><h2>${localStorage.seen?'No '+m.name+' entries yet':'Welcome to Shop Assistant'}</h2><p>${localStorage.seen?'':'Your job log, tool tracker and manuals library in one place. Everything is saved on this device, works offline, and nothing is sent anywhere.<br><br>'}${m.empty}</p><button class="btn accent" onclick="edit()">＋ Add first entry</button><p style="margin-top:24px"><button class="btn" onclick="$('#restoreFile').click()">Restore a backup</button></p></div>`;return}
 localStorage.seen=1;
 let opts='';if(tab==='jobs')opts='<option value="">All jobs</option><option value="open">Open</option><option value="done">Done</option>';
 else if(tab==='tools')opts='<option value="">All tools</option>'+Object.entries(TOOL_STATUS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
 else opts='<option value="">All makes</option>'+[...new Set(items.map(i=>i.make).filter(Boolean))].sort().map(v=>`<option>${esc(v)}</option>`).join('');
 const ql=q.toLowerCase();
 const list=items.filter(i=>(!filt||(tab==='manuals'?i.make===filt:i.status===filt))&&(!ql||JSON.stringify(i).toLowerCase().includes(ql)));
 main.innerHTML=`<div class="bar"><input id="q" type="search" placeholder="Search ${m.name}…" value="${esc(q)}"><select id="f">${opts}</select></div><div class="m" style="color:var(--mut);margin-bottom:8px">${list.length} of ${items.length}</div>`+list.map(card).join('');
 $('#f').value=filt;$('#q').oninput=e=>{q=e.target.value;renderList()};$('#f').onchange=e=>{filt=e.target.value;render()};
 main.querySelectorAll('.card').forEach(c=>c.onclick=()=>edit(c.dataset.id));
}
let rt;function renderList(){clearTimeout(rt);rt=setTimeout(async()=>{const p=$('#q').selectionStart;await render();const i=$('#q');i.focus();i.setSelectionRange(p,p)},200)}
function card(i){
 if(tab==='jobs')return `<div class="card b-${i.status}" data-id="${i.id}"><span class="pill s-${i.status}">${i.status==='done'?'DONE':'OPEN'}</span><h3>${esc(i.unit||'(no unit)')}</h3><div class="m">${esc([i.date,i.customer,i.meter,i.labor&&i.labor+' h'].filter(Boolean).join(' · '))}</div><div>${esc(i.complaint)}</div></div>`;
 if(tab==='tools')return `<div class="card b-${i.status}" data-id="${i.id}"><span class="pill s-${i.status}">${TOOL_STATUS[i.status]}</span><h3>${esc(i.name)}</h3><div class="m">${esc([i.brand,i.category,i.location].filter(Boolean).join(' · '))}${i.status==='loaned'&&i.loanedTo?'<br>→ '+esc(i.loanedTo)+' '+esc(i.date):''}</div></div>`;
 return `<div class="card" data-id="${i.id}">${i.fileName?'<span class="pill s-in">📎</span>':''}<h3>${esc(i.title)}</h3><div class="m">${esc([i.make,i.model,i.years,i.system,i.type].filter(Boolean).join(' · '))}${i.location?'<br>📍 '+esc(i.location):''}</div></div>`;
}
// ---------- Edit ----------
async function edit(id){
 const it=id?await get(tab,id):{status:tab==='jobs'?'open':'in',date:today(),parts:[]};
 const f=$('#form');
 let h=`<h2 style="margin-top:0">${id?'Edit':'New'} ${META[tab].name.replace(/ Log| Tracker|s$/,'')||''}</h2>`;
 for(const [k,l,t,o] of SCHEMA[tab]){
  h+=`<label>${l}</label>`;
  if(t==='area')h+=`<textarea name="${k}">${esc(it[k])}</textarea>`;
  else if(t==='select')h+=`<select name="${k}">${Object.entries(o).map(([a,b])=>`<option value="${a}"${it[k]===a?' selected':''}>${b}</option>`).join('')}</select>`;
  else if(t==='parts')h+=`<div class="parts" id="parts"></div><button type="button" class="btn" id="addPart">＋ Add part</button>`;
  else if(t==='file')h+=`<input type="file" name="file" accept="application/pdf,image/*" capture="environment"><div class="att" id="att"></div>`;
  else h+=`<input name="${k}" type="${t==='number'?'number" step="0.1" inputmode="decimal':t||'text'}" value="${esc(it[k])}">`;
 }
 if(id&&tab==='manuals'&&it.link)h+=`<p><a href="${esc(it.link)}" target="_blank" rel="noopener">Open link ↗</a></p>`;
 h+=`<div class="actions">${id?'<button type="button" class="btn danger" id="delBtn">Delete</button>':''}<button type="button" class="btn" id="cancel">Cancel</button><button type="submit" class="btn accent">Save</button></div>`;
 f.innerHTML=h;
 if(tab==='jobs'){const P=$('#parts');const add=(p={})=>{const r=document.createElement('div');r.className='row';r.innerHTML=`<input placeholder="Part #" class="pn" value="${esc(p.num)}"><input placeholder="Qty" class="pq" inputmode="decimal" value="${esc(p.qty)}" style="flex:0 0 80px"><button type="button" class="btn">✕</button>`;r.querySelector('button').onclick=()=>r.remove();P.append(r)};(it.parts||[]).forEach(add);if(!(it.parts||[]).length)add();$('#addPart').onclick=()=>add()}
 let removeFile=false;
 if(tab==='manuals'&&it.fileName){const fr=await get('files',id);const a=$('#att');if(fr){const u=URL.createObjectURL(fr.blob);a.innerHTML=(fr.blob.type.startsWith('image/')?`<img src="${u}">`:'')+`<p>📎 <a href="${u}" target="_blank">${esc(it.fileName)}</a> <button type="button" class="btn" id="rmFile">Remove</button></p>`;$('#rmFile').onclick=()=>{removeFile=true;a.innerHTML='<p>Attachment will be removed on save.</p>'}}}
 $('#cancel').onclick=()=>$('#dlg').close();
 if(id)$('#delBtn').onclick=async()=>{if(confirm('Delete this entry?')){await del(tab,id);await del('files',id).catch(()=>{});$('#dlg').close();render()}};
 f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);const o={...it,id:it.id||uid(),created:it.created||Date.now(),updated:Date.now()};
  for(const [k,,t] of SCHEMA[tab]){if(t==='parts')o.parts=[...f.querySelectorAll('#parts .row')].map(r=>({num:r.querySelector('.pn').value.trim(),qty:r.querySelector('.pq').value.trim()})).filter(p=>p.num||p.qty);else if(t!=='file')o[k]=(fd.get(k)||'').trim()}
  if(tab==='manuals'){const file=fd.get('file');if(file&&file.size){await put('files',{id:o.id,blob:file,name:file.name});o.fileName=file.name}else if(removeFile){await del('files',o.id);delete o.fileName}}
  await put(tab,o);$('#dlg').close();render()};
 $('#dlg').showModal();
}
// ---------- CSV / backup ----------
function download(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;document.body.append(a);a.click();a.remove()}
async function exportCSV(){const items=await all(tab);const cols=SCHEMA[tab].filter(c=>c[2]!=='file').map(c=>c[0]);if(tab==='manuals')cols.push('fileName');
 const cell=v=>{if(Array.isArray(v))v=v.map(p=>p.num+(p.qty?' x'+p.qty:'')).join('; ');if(tab==='tools'&&TOOL_STATUS[v])v=TOOL_STATUS[v];v=String(v??'');return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
 const csv=[cols.join(','),...items.map(i=>cols.map(c=>cell(i[c])).join(','))].join('\r\n');download(`shop-assistant-${tab}-${today()}.csv`,csv,'text/csv')}
const b64=b=>new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(b)});
async function backup(){const out={app:'shop-assistant',version:1,exported:new Date().toISOString()};for(const s of ['jobs','tools','manuals'])out[s]=await all(s);out.files=await Promise.all((await all('files')).map(async f=>({id:f.id,name:f.name,data:await b64(f.blob)})));download(`shop-assistant-backup-${today()}.json`,JSON.stringify(out),'application/json')}
async function restore(file){try{const d=JSON.parse(await file.text());if(d.app!=='shop-assistant')throw 0;if(!confirm('Restore will REPLACE all current data on this device. Continue?'))return;
 for(const s of STORES)await clear(s);for(const s of ['jobs','tools','manuals'])for(const i of d[s]||[])await put(s,i);
 for(const f of d.files||[]){const blob=await (await fetch(f.data)).blob();await put('files',{id:f.id,name:f.name,blob})}alert('Backup restored.');render()}catch(e){alert('That file is not a Shop Assistant backup.')}}
// ---------- Wiring ----------
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;q='';filt='';document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('on',x===b));render();scrollTo(0,0)});
$('#fab').onclick=()=>edit();
$('#menuBtn').onclick=e=>{e.stopPropagation();$('#menu').hidden=!$('#menu').hidden};document.addEventListener('click',()=>$('#menu').hidden=true);
$('#menu').onclick=e=>{const a=e.target.dataset.act;if(a==='backup')backup();if(a==='restore')$('#restoreFile').click();if(a==='csv')exportCSV()};
$('#restoreFile').onchange=e=>{if(e.target.files[0])restore(e.target.files[0]);e.target.value=''};
let deferred;addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#installBtn').hidden=false});
$('#installBtn').onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;$('#installBtn').hidden=true};
addEventListener('appinstalled',()=>$('#installBtn').hidden=true);
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!standalone&&!localStorage.iosTip){$('#iosTip').hidden=false;localStorage.iosTip=1}
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
openDB().then(render);
