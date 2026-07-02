
// ── CONSTANTEN & STATE ──
const IC = {activiteit:'&#9881;', start:'&#9654;', einde:'&#9209;', beslissing:'&#9670;', document:'&#128196;'};
const CSV_COLS = ['proces_id','proces_naam','stap_nr','ouder_stap_nr','stap_naam','type','verantwoordelijke','systeem','beschrijving','input_1','input_1_bron','input_2','input_2_bron','input_3','input_3_bron','output_1','output_1_doel','output_2','output_2_doel','output_3','output_3_doel','volgorde','status'];
const S = {data:null, hid:null, pad:[], view:'v', bpid:null, bsid:null, gw:false, eaMode:'ist', eaSollProcs:[], eaGekozen:null};
let csvBuf = null;
let jsonFileHandle = null;
let uitgeklapt = new Set();
let uitCl = new Set();
let bewClId = null;
let _iorCnt = 0;
let bewClOuderId = null;

// ── HULPFUNCTIES ──
function td(){return new Date().toISOString().split('T')[0];}
function gid(p){return p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5);}
function proc(id){return (S.data?.processen||[]).find(p=>p.id===id);}
function pnm(id){return proc(id)?.naam||id;}

// ── PRD CROSS-REFERENTIE INDEX ──
let _prdIdx=null;
function prdIdx(){
  if(_prdIdx)return _prdIdx;
  _prdIdx={};
  for(const p of S.data?.processen||[]){
    for(const s of p.stappen||[]){
      for(const o of s.output||[]){
        if(o.doel&&o.doel!=='intern'){
          if(!_prdIdx[o.doel])_prdIdx[o.doel]={prod:[],cons:[]};
          if(!_prdIdx[o.doel].prod.find(x=>x.id===p.id))_prdIdx[o.doel].prod.push({id:p.id,naam:p.naam});
        }
      }
      for(const inp of s.input||[]){
        if(inp.bron&&inp.bron!=='intern'){
          if(!_prdIdx[inp.bron])_prdIdx[inp.bron]={prod:[],cons:[]};
          if(!_prdIdx[inp.bron].cons.find(x=>x.id===p.id))_prdIdx[inp.bron].cons.push({id:p.id,naam:p.naam});
        }
      }
    }
  }
  return _prdIdx;
}
// Geef naam van producerende processen voor een input-bron
function bronNm(code){
  if(!code||code==='intern')return '';
  const p=proc(code);if(p)return p.naam;
  const prod=prdIdx()[code]?.prod||[];
  if(!prod.length)return code;
  const nm=prod.slice(0,2).map(x=>x.naam);
  return prod.length>2?nm.join(' · ')+' +'+(prod.length-2):nm.join(' · ');
}
// Geef naam van consumerende processen voor een output-doel
function doelNm(code){
  if(!code||code==='intern')return '';
  const p=proc(code);if(p)return p.naam;
  const cons=prdIdx()[code]?.cons||[];
  if(!cons.length)return code;
  const nm=cons.slice(0,2).map(x=>x.naam);
  return cons.length>2?nm.join(' · ')+' +'+(cons.length-2):nm.join(' · ');
}
function sluit(id){document.getElementById(id).style.display='none';}
function notif(t,tp){
  const el=document.getElementById('nf');
  el.textContent=(tp==='ok'?'OK: ':'Let op: ')+t;
  el.className='zb '+tp;
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('zb'),3200);
}

// ── CLUSTER HELPERS ──
function clusterById(id,l){for(const c of(l||S.data?.clusters||[])){if(c.id===id)return c;const r=clusterById(id,c.subclusters||[]);if(r)return r;}return null;}
function clusterAfk(id){const c=clusterById(id);if(!c)return(id||'XX').toUpperCase().slice(0,2);return c.afkorting||c.label.replace(/\s/g,'').slice(0,2).toUpperCase();}
function allesClusters(l,lv){l=l||S.data?.clusters||[];lv=lv||0;const r=[];for(const c of l){r.push({...c,_level:lv});r.push(...allesClusters(c.subclusters||[],lv+1));}return r;}
function clusterNiveau(id,l,n){l=l||S.data?.clusters||[];n=n||1;for(const c of l){if(c.id===id)return n;const r=clusterNiveau(id,c.subclusters||[],n+1);if(r)return r;}return 0;}
function heeftZichtbaar(c,z){const p=(S.data?.processen||[]).filter(x=>x.categorie===c.id&&(!z||x.naam.toLowerCase().includes(z)));if(p.length)return true;return(c.subclusters||[]).some(sc=>heeftZichtbaar(sc,z));}
function alleClusterIds(c){const ids=[c.id];(c.subclusters||[]).forEach(sc=>ids.push(...alleClusterIds(sc)));return ids;}

// ── NUMMERING ──
function catPfx(p){return clusterAfk(p?.categorie);}
function procLetter(p){
  if(!p||!S.data)return 'A';
  const inCat=(S.data.processen||[]).filter(x=>x.categorie===p.categorie).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)||(a.naam||'').localeCompare(b.naam||''));
  const idx=inCat.findIndex(x=>x.id===p.id);
  return String.fromCharCode(65+Math.max(0,idx));
}
function procNr(p){return catPfx(p)+'-'+procLetter(p);}
function n1Nr(p,idx){return procNr(p)+String(idx+1).padStart(2,'0');}
function n1NrVanId(sid,p){
  const idx=(p.stappen||[]).findIndex(s=>s.id===sid);
  return idx<0?'?':n1Nr(p,idx);
}
function stapNr(volg,i){
  const p=proc(S.hid); if(!p)return'?';
  const niv=huidigNiv();
  if(niv===1) return n1Nr(p,i);
  const ouderN1=zoekStap(p.stappen||[],S.pad[0]);
  const n1idx=(p.stappen||[]).findIndex(s=>s.id===S.pad[0]);
  const base=n1Nr(p,n1idx);
  if(niv===2) return base+'.'+String(i+1).padStart(2,'0');
  const ouderN2=zoekStap(ouderN1?.substappen||[],S.pad[1]);
  const n2idx=(ouderN1?.substappen||[]).findIndex(s=>s.id===S.pad[1]);
  const base2=base+'.'+String(n2idx+1).padStart(2,'0');
  return base2+'.'+String(i+1).padStart(2,'0');
}
function huidigNiv(){return S.pad.length+1;}
function ouderStap(){
  if(!S.pad.length)return null;
  const p=proc(S.hid); if(!p)return null;
  return zoekStap(p.stappen||[],S.pad[S.pad.length-1]);
}
function zoekStap(stappen,sid){
  for(const s of stappen){
    if(s.id===sid)return s;
    const r=zoekStap(s.substappen||[],sid);
    if(r)return r;
  }
  return null;
}

// ── INITIALISATIE ──
function init(){
  try{
    const r=localStorage.getItem('ipp_v2');
    if(r){
      const d=JSON.parse(r);
      // Sla lege standaard-staat over (clusters aanwezig maar geen processen én geen handmatige clusters)
      const heeftInhoud=d&&d.processen&&(d.processen.length>0||(d.clusters||[]).some(c=>(c.subclusters||[]).length>0));
      if(heeftInhoud){
        migr(d);S.data=d;uitCl=new Set();allesClusters().forEach(c=>uitCl.add(c.id));laadUI();setGw(false);return;
      }
    }
  }catch(e){}
  try{localStorage.removeItem('ipp_v2');}catch(e){}
  S.data=leeg();uitCl=new Set();laadUI();setGw(false);
}
function beginOpnieuw(){
  if(!confirm('Alles wissen en opnieuw beginnen?\n\nAlle geladen data, processen en clusters worden verwijderd.'))return;
  try{localStorage.removeItem('ipp_v2');}catch(e){}
  S.data=leeg();S.hid=null;S.pad=[];S.bpid=null;S.bsid=null;
  uitCl=new Set();jsonFileHandle=null;acf='alle';
  document.getElementById('bos-als').style.display='none';
  document.getElementById('vt').style.display='none';
  ['bst','bbw','bib','bea'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('wbs').textContent='';
  document.getElementById('canvas').innerHTML='<div id="wlk"><div class="wi">&#128193;</div><h2>Geen data geladen</h2><p>Gebruik <strong>Laden</strong> om een JSON-bestand te openen.</p></div>';
  laadUI();setGw(false);
}
function leeg(){
  return{versie:'1.1',project:'IPP Procesmanagement Antea Group',aangepast:td(),
    clusters:[],
    rollen:['Projectmanager','Contractmanager','Senior Adviseur','Adviseur','Kwaliteitsmanager','Systems Engineer','Omgevingsmanager','Vergunningenspecialist','Ontwerper','Opdrachtgever','Klant'],
    systemen:['Relatics','GIS','SharePoint','MS Project','Teams','Contractmanager'],
    documenten:[],
    eaLinks:[],
    processen:[]
  };
}
function migr(d){
  // Migreer categorieen → clusters
  if(d.categorieen&&!d.clusters){
    const pfx={pm:'PM',klant:'KL',se:'SE',ontwerp:'ON',onderzoek:'OZ',structuur:'ST',beheersing:'PB'};
    d.clusters=(d.categorieen||[]).map((c,i)=>({...c,afkorting:pfx[c.id]||(c.id||'XX').toUpperCase().slice(0,2),volgorde:i+1,subclusters:[]}));
    delete d.categorieen;
  }
  // Zorg dat subclusters array heeft
  function ensureSub(cl){(cl||[]).forEach(c=>{if(!Array.isArray(c.subclusters))c.subclusters=[];ensureSub(c.subclusters);});}
  ensureSub(d.clusters);
  // Migreer stappen
  function fix(st){if(!Array.isArray(st))return;st.forEach(s=>{
    if(!Array.isArray(s.substappen))s.substappen=[];
    if(!Array.isArray(s.medeverantwoordelijken))s.medeverantwoordelijken=[];
    fix(s.substappen);
  });}
  (d.processen||[]).forEach(p=>fix(p.stappen||[]));
  if(!d.documenten)d.documenten=[];
  if(!Array.isArray(d.eaLinks))d.eaLinks=[];
}
function laadUI(){
  allesClusters().forEach(c=>uitCl.add(c.id));
  _prdIdx=null;
  bouwCF();bouwLijst();vulSels();vulCat();
}
function setGw(ja){
  S.gw=ja;
  const el=document.getElementById('os'),btn=document.getElementById('bos');
  if(ja){el.textContent='Niet opgeslagen';el.className='gw';btn.disabled=false;}
  else{el.textContent='Opgeslagen';el.className='';btn.disabled=true;}
}
function markeer(){
  _prdIdx=null;
  try{localStorage.setItem('ipp_v2',JSON.stringify(S.data));}catch(e){}
  setGw(true);
}

// ── SIDEBAR ──
let acf='alle';
function bouwCF(){
  const el=document.getElementById('cf');
  el.innerHTML='<button class="cfb a" onclick="catF(\'alle\')">Alle</button>';
  (S.data.clusters||[]).forEach(c=>el.innerHTML+=`<button class="cfb" onclick="catF('${c.id}')">${c.label.split(' ')[0]}</button>`);
}
function catF(c){acf=c;document.querySelectorAll('.cfb').forEach((b,i)=>b.classList.toggle('a',i===0?c==='alle':b.onclick.toString().includes("'"+c+"'")));bouwLijst();}
function filterLijst(){bouwLijst();}
function toggleCluster(cid){if(uitCl.has(cid))uitCl.delete(cid);else uitCl.add(cid);bouwLijst();}

function renderClusterNode(c,depth,z){
  const procHier=(S.data.processen||[]).filter(p=>p.categorie===c.id&&(!z||p.naam.toLowerCase().includes(z)));
  const subs=(c.subclusters||[]);
  const zSubs=z?subs.filter(sc=>heeftZichtbaar(sc,z)):subs;
  if(z&&!procHier.length&&!zSubs.length)return'';
  const exp=uitCl.has(c.id);
  const totaal=(S.data.processen||[]).filter(p=>alleClusterIds(c).includes(p.categorie)).length;
  const pad=14+depth*12;
  const diepCls=depth===0?'top':depth===1?'sub':'sub2';
  let h=`<div class="cl-hdr ${diepCls}" style="padding-left:${pad}px" onclick="toggleCluster('${c.id}')">`;
  h+=`<span class="cl-ico">${exp?'&#9660;':'&#9654;'}</span>`;
  h+=`<span class="cl-dot" style="background:${c.kleur||'#888'}"></span>`;
  h+=`<span class="cl-nm">${c.label}</span>`;
  if(totaal)h+=`<span class="cl-cnt">${totaal}</span>`;
  h+=`<span class="cl-acties"><button class="cl-ab" title="Bewerk cluster" onclick="event.stopPropagation();clusterModal('${c.id}')">&#9998;</button><button class="cl-ab" title="Nieuw sub-cluster" onclick="event.stopPropagation();clusterModal(null,'${c.id}')">+</button></span>`;
  h+=`</div>`;
  if(exp){
    zSubs.sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)).forEach(sc=>{h+=renderClusterNode(sc,depth+1,z);});
    procHier.sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)||(a.naam||'').localeCompare(b.naam||'')).forEach(p=>{
      const nr=procNr(p);
      h+=`<div class="pi ${p.id===S.hid?'a':''}" onclick="sel('${p.id}')" style="padding-left:${pad+18}px">
        <div class="pnm"><span style="font-family:var(--m);font-size:10px;color:var(--ga);margin-right:5px">${nr}</span>${p.naam}</div>
        <div class="pmt"><div class="cd" style="background:${c.kleur||'#888'}"></div><span>${p.eigenaar||''}</span><span class="sb2 ${p.status||''}">${p.status||'concept'}</span></div>
      </div>`;
    });
  }
  return h;
}

function bouwLijst(){
  const z=document.getElementById('zoek').value.toLowerCase();
  const el=document.getElementById('pl');
  let topNiveau=(S.data.clusters||[]);
  if(acf!=='alle')topNiveau=topNiveau.filter(c=>c.id===acf);
  let html='';
  topNiveau.sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)).forEach(c=>{html+=renderClusterNode(c,0,z);});
  if(!html){el.innerHTML='<div style="padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center"><div style="font-size:28px">&#128193;</div><p style="font-size:12px;font-weight:600;color:var(--g2)">Geen data geladen</p><p style="font-size:11px;color:var(--g3);line-height:1.5">Gebruik <strong style="color:var(--ga)">Laden</strong> rechtsboven om een JSON-bestand te openen.</p></div>';return;}
  el.innerHTML=html;
}

// ── SELECTIE & NAVIGATIE ──
function sel(id){
  S.hid=id;S.pad=[];sluitSP();bouwLijst();
  const p=proc(id);if(!p)return;
  document.getElementById('wbs').textContent=p.beschrijving||'';
  document.getElementById('vt').style.display='flex';
  ['bst','bbw','bib','bea'].forEach(i=>document.getElementById(i).style.display='');
  teken();
}
function setView(v){
  S.view=v;
  ['vbv','vbt','vbsl'].forEach(id=>document.getElementById(id)?.classList.toggle('a',id==='vb'+v));
  sluitSP();teken();
}
function openSP(sid){
  S.pad=[sid];
  const p=proc(S.hid);if(!p)return;
  const ouder=zoekStap(p.stappen||[],sid);if(!ouder)return;
  const nr=n1NrVanId(sid,p);
  const substappen=(ouder.substappen||[]).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0));
  document.getElementById('sp-nr').textContent=nr;
  document.getElementById('sp-titel').textContent=ouder.naam;
  document.getElementById('sp-niv').textContent='N2 - Substappen';
  document.getElementById('sp-add').textContent='+ N2-substap toevoegen';
  vulSPBody(substappen,nr,2,sid,null);
  document.querySelectorAll('.sk').forEach(k=>k.classList.remove('actief-sub'));
  document.querySelector('.sk[data-sid="'+sid+'"]')?.classList.add('actief-sub');
  document.getElementById('sp').classList.add('open');
}
function openSP2(n1sid,n2sid){
  S.pad=[n1sid,n2sid];
  const p=proc(S.hid);if(!p)return;
  const n1=zoekStap(p.stappen||[],n1sid);
  const n2=zoekStap(n1?.substappen||[],n2sid);if(!n2)return;
  const n1nr=n1NrVanId(n1sid,p);
  const n2idx=(n1?.substappen||[]).findIndex(s=>s.id===n2sid);
  const n2nr=n1nr+'.'+String(n2idx+1).padStart(2,'0');
  const substappen=(n2.substappen||[]).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0));
  document.getElementById('sp-nr').textContent=n2nr;
  document.getElementById('sp-titel').textContent=n2.naam;
  document.getElementById('sp-niv').textContent='N3 - Substappen';
  document.getElementById('sp-add').textContent='+ N3-substap toevoegen';
  vulSPBody(substappen,n2nr,3,n1sid,n2sid);
  document.getElementById('sp').classList.add('open');
}
function vulSPBody(substappen,ouderNr,niv,n1sid,n2sid){
  const body=document.getElementById('sp-body');
  if(!substappen.length){
    body.innerHTML='<div class="leeg" style="padding:30px 10px"><div class="li">&#128221;</div><h3 style="font-size:14px">Nog geen substappen</h3><p style="font-size:12px">Gebruik de knop hieronder.</p></div>';
    return;
  }
  let h='';
  substappen.forEach((s,i)=>{
    const snr=ouderNr+'.'+String(i+1).padStart(2,'0');
    const tc=s.type||'activiteit';
    const heeftSub=(s.substappen||[]).length>0;
    const bewerk=n2sid?`S.pad=['${n1sid}','${n2sid}'];S.bsid='${s.id}';stapModal('${s.id}')`:`S.pad=['${n1sid}'];S.bsid='${s.id}';stapModal('${s.id}')`;
    h+=(i>0?'<div class="sp-pijl">&#8595;</div>':'')+
    `<div class="spk ${tc}">
      <div class="sp-nr">${snr}</div>
      <div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:3px">
        <div class="ski" style="width:22px;height:22px;font-size:11px;flex-shrink:0;margin-top:1px">${IC[s.type]||'?'}</div>
        <div class="sp-nm" style="margin-bottom:0">${s.naam}</div>
      </div>
      <div class="sp-mt"><span>&#128100; ${s.verantwoordelijke||'-'}</span>${s.systeem?`<span class="sks">${s.systeem}</span>`:''}</div>
      <div class="sp-ac">
        <button class="spa" onclick="showDet('${s.id}')">Detail</button>
        <button class="spa bwrk" onclick="${bewerk}">Bewerk</button>
        ${niv<3?`<button class="spa sub ${heeftSub?'heeft':''}" onclick="${n2sid?'':''} openSP2('${n1sid||n2sid?n1sid:''}','${s.id}')">
          ${heeftSub?'v'+s.substappen.length+' N3':'+ N3'}
        </button>`:''}
      </div>
    </div>`;
  });
  body.innerHTML=h;
}
function sluitSP(){
  document.getElementById('sp').classList.remove('open');
  document.querySelectorAll('.sk').forEach(k=>k.classList.remove('actief-sub'));
  S.pad=[];
}
function bouwBC(){
  const el=document.getElementById('bc');
  const p=proc(S.hid);
  if(!p){el.style.display='none';return;}
  el.style.display='flex';
  const nr=procNr(p);
  el.innerHTML=`<span class="bc-item"><span style="font-family:var(--m);font-size:11px;color:var(--ga);margin-right:4px">${nr}</span><strong>${p.naam}</strong></span>`;
}

// ── SCHEMA TEKENEN ──
function teken(){
  const cv=document.getElementById('canvas');
  const p=proc(S.hid);if(!p)return;
  const st=(p.stappen||[]).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0));
  bouwBC();
  if(!st.length){
    cv.innerHTML='<div class="leeg"><div class="li">&#128221;</div><h3>Nog geen stappen</h3><p>Voeg de eerste stap toe via + Stap.</p></div>';
    return;
  }
  if(S.view==='t')tekenT(cv,st);
  else if(S.view==='sl')tekenSL(cv,st);
  else tekenV(cv,st);
  if(S.pad.length>0)openSP(S.pad[0]);
}
function ioH(s){
  const inp=s.input||[],out=s.output||[];
  if(!inp.length&&!out.length)return'';
  let h='<div class="iob">';
  if(inp.length){h+='<div class="iok"><div class="iol">Input</div>';inp.forEach(io=>{const e=io.bron&&io.bron!=='intern';h+=`<div class="ioi ${e?'ext':''}">${io.label}${e?` <span class="ioe">van ${bronNm(io.bron)}</span>`:''}</div>`;});h+='</div>';}
  if(out.length){h+='<div class="iok"><div class="iol">Output</div>';out.forEach(io=>{const e=io.doel&&io.doel!=='intern';h+=`<div class="ioi ${e?'ext':''}">${io.label}${e?` <span class="ioe">naar ${doelNm(io.doel)}</span>`:''}</div>`;});h+='</div>';}
  return h+'</div>';
}
function tcls(type){return type==='start'?'ts':type==='einde'?'te':type==='beslissing'?'tb':type==='document'?'td':'ta';}

function toggleN2(sid){
  if(uitgeklapt.has(sid)) uitgeklapt.delete(sid); else uitgeklapt.add(sid);
  S.pad=[];
  document.getElementById('sp').classList.remove('open');
  teken();
}

function n2Kolom(subs,n1nr,n1sid){
  const typeNm={activiteit:'Activiteit',start:'Start',einde:'Einde',beslissing:'Beslissing',document:'Document'};
  let h='<div class="n2-col">';
  subs.forEach((s,i)=>{
    const tc=tcls(s.type),nr=n1nr+'.'+String(i+1).padStart(2,'0');
    const inp=s.input||[],out=s.output||[];
    let inH='<div class="sk2-io"><div class="sk2-iol">— INPUT</div>';
    if(inp.length) inp.forEach(io=>{const e=io.bron&&io.bron!=='intern';inH+=`<div class="ioi ${e?'ext':''}" style="font-size:10px;padding:2px 5px">${io.label}${e?` <span class="ioe">&#8593; ${bronNm(io.bron)}</span>`:''}</div>`;});
    else inH+='<span style="font-size:10px;color:var(--g3)">—</span>';
    inH+='</div>';
    let stH=`<div class="sk2-step ${tc}"><div class="sk2-thdr"><span class="sk2-ico">${IC[s.type]||'?'}</span><span>${typeNm[s.type]||s.type}</span><span style="margin-left:auto;font-family:var(--m);font-size:10px">${nr}</span></div>`;
    stH+=`<div class="sk2-body"><div class="skn" style="font-size:12px">${s.naam}</div>`;
    stH+=`<div class="skr" style="margin-top:3px;font-size:10px">&#128100; ${s.verantwoordelijke||'-'}${s.systeem?` <span class="sks">${s.systeem}</span>`:''}</div>`;
    if(s.beschrijving) stH+=`<div style="font-size:10px;color:var(--gs);margin-top:4px;line-height:1.4">${s.beschrijving}</div>`;
    stH+=`<div class="sk-acties" style="margin-top:6px;padding-top:6px"><button class="sa" style="font-size:10px;padding:2px 7px" onclick="event.stopPropagation();showDet('${s.id}')">Detail</button><button class="sa bwrk" style="font-size:10px;padding:2px 7px" onclick="event.stopPropagation();S.pad=['${n1sid}'];S.bsid='${s.id}';stapModal('${s.id}')">Bewerk</button></div></div></div>`;
    let outH='<div class="sk2-io"><div class="sk2-iol">OUTPUT —</div>';
    if(out.length) out.forEach(io=>{const e=io.doel&&io.doel!=='intern';outH+=`<div class="ioi ${e?'ext':''}" style="font-size:10px;padding:2px 5px">${io.label}${e?` <span class="ioe">&#8594; ${doelNm(io.doel)}</span>`:''}</div>`;});
    else outH+='<span style="font-size:10px;color:var(--g3)">—</span>';
    outH+='</div>';
    if(i>0) h+='<div class="n2-kpijl"></div>';
    h+=`<div class="sk2row">${inH}${stH}${outH}</div>`;
  });
  return h+'</div>';
}

function tekenV(cv,st){
  const p=proc(S.hid);
  const typeNm={activiteit:'Activiteit',start:'Start',einde:'Einde',beslissing:'Beslissing',document:'Document'};
  const pnr=procNr(p);
  let h=`<div style="display:flex;flex-direction:column;align-items:center;min-width:880px"><div style="width:860px;text-align:center;padding-bottom:16px;margin-bottom:8px;border-bottom:1px solid var(--g1)"><span style="font-family:var(--m);font-size:13px;font-weight:700;color:var(--ga)">${pnr}</span><span style="font-size:20px;font-weight:700;color:var(--gd);margin-left:12px">${p.naam}</span></div><div class="sv">`;
  st.forEach((s,i)=>{
    const tc=tcls(s.type);
    const heeftSub=(s.substappen||[]).length>0;
    const exp=heeftSub&&uitgeklapt.has(s.id);
    const nr=n1Nr(p,i);
    const isActief=S.pad.length>0&&S.pad[0]===s.id;
    const inp=s.input||[], out=s.output||[];
    // INPUT blok
    let inH='<div class="sk3-io"><div class="sk3-iol">— INPUT</div>';
    if(inp.length) inp.forEach(io=>{
      const e=io.bron&&io.bron!=='intern';
      inH+=`<div class="ioi ${e?'ext':''}">${io.label}${e?` <span class="ioe">&#8593; ${bronNm(io.bron)}</span>`:''}</div>`;
    }); else inH+='<span style="font-size:11px;color:var(--g3)">—</span>';
    inH+='</div>';
    // STAP kaart
    let stH=`<div class="sk3-step ${tc} ${isActief?'actief-sub':''}" data-sid="${s.id}">`;
    stH+=`<div class="sk3-thdr"><span class="sk3-ico">${IC[s.type]||'?'}</span><span>${typeNm[s.type]||s.type}</span><span style="margin-left:auto;font-family:var(--m);font-size:11px">${nr}</span></div>`;
    stH+=`<div class="sk3-body">`;
    stH+=`<div class="skn">${s.naam}</div>`;
    stH+=`<div class="skr" style="margin-top:4px">&#128100; ${s.verantwoordelijke||'-'}${s.systeem?` <span class="sks">${s.systeem}</span>`:''}</div>`;
    if(s.beschrijving) stH+=`<div style="font-size:11px;color:var(--gs);margin-top:5px;line-height:1.45">${s.beschrijving}</div>`;
    stH+=`<div class="sk-acties">`;
    stH+=`<button class="sa" onclick="event.stopPropagation();showDet('${s.id}')">Detail</button>`;
    stH+=`<button class="sa bwrk" onclick="event.stopPropagation();S.pad=[];S.bsid='${s.id}';stapModal('${s.id}')">Bewerk</button>`;
    if(heeftSub) stH+=`<button class="sa sub heeft" onclick="event.stopPropagation();toggleN2('${s.id}')">${exp?'&#9650; N2 inklappen':'v'+s.substappen.length+' N2 &#8595;'}</button><button class="sa sub" onclick="event.stopPropagation();openSP('${s.id}')">+ N2</button>`;
    else stH+=`<button class="sa sub" onclick="event.stopPropagation();openSP('${s.id}')">+ N2 toevoegen</button>`;
    stH+=`</div></div></div>`;
    // OUTPUT blok — eigen N1-outputs + outputs van substappen (N2/N3), gededupliceerd
    const subOuts=(()=>{
      const eigen=new Set(out.map(io=>(io.label||'').toLowerCase()));
      const seen=new Set();const res=[];
      function verzamel(subs){(subs||[]).forEach(sub=>{(sub.output||[]).forEach(io=>{const k=(io.label||'').toLowerCase();if(k&&!eigen.has(k)&&!seen.has(k)){seen.add(k);res.push(io);}});verzamel(sub.substappen||[]);});}
      verzamel(s.substappen||[]);return res;
    })();
    let outH='<div class="sk3-io"><div class="sk3-iol">OUTPUT —</div>';
    if(out.length||subOuts.length){
      out.forEach(io=>{const e=io.doel&&io.doel!=='intern';outH+=`<div class="ioi ${e?'ext':''}">${io.label}${e?` <span class="ioe">&#8594; ${doelNm(io.doel)}</span>`:''}</div>`;});
      if(subOuts.length){
        if(out.length)outH+='<div style="font-size:9px;color:var(--gs);margin:3px 0 1px;opacity:.8">via substappen:</div>';
        subOuts.forEach(io=>{const e=io.doel&&io.doel!=='intern';outH+=`<div class="ioi ${e?'ext':''}" style="font-size:10px;opacity:.8">${io.label}${e?` <span class="ioe">&#8594; ${doelNm(io.doel)}</span>`:''}</div>`;});
      }
    } else outH+='<span style="font-size:11px;color:var(--g3)">—</span>';
    outH+='</div>';
    if(exp){
      const subs=(s.substappen||[]).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0));
      const ptop=i>0?'padding-top:22px':'';
      h+=`<div class="sww-exp"><div class="sww-exp-n1">${i>0?'<div class="pijl"></div>':''}<div class="sk3row">${inH}${stH}${outH}</div></div>`;
      h+=`<div class="n2-col-wrap" style="${ptop}"><div class="n2-harrow">&#8594;</div>${n2Kolom(subs,nr,s.id)}</div></div>`;
    } else {
      h+=`<div class="sww">${i>0?'<div class="pijl"></div>':''}<div class="sk3row">${inH}${stH}${outH}</div></div>`;
    }
  });
  cv.innerHTML=h+'</div></div>';
}
function alleVerantw(s){return[s.verantwoordelijke||'Onbekend',...(s.medeverantwoordelijken||[])].filter(Boolean);}
function tekenSL(cv,st){
  const p=proc(S.hid);
  const rollen=[...new Set(st.flatMap(s=>alleVerantw(s)))];
  const primaire=new Set(st.map(s=>s.verantwoordelijke).filter(Boolean));
  const cw=Math.max(180,Math.floor((window.innerWidth-350)/Math.max(st.length,1)));
  const gtc=`170px repeat(${st.length},${cw}px)`;
  let h=`<div class="slw"><div class="slg" style="grid-template-columns:${gtc}">`;
  h+=`<div class="slhr">Verantwoordelijke</div>`;
  st.forEach((s,i)=>{const nr=n1Nr(p,i);h+=`<div class="slhc">${nr} ${s.naam.length>20?s.naam.slice(0,18)+'...':s.naam}</div>`;});
  rollen.forEach(rol=>{
    const isHoofd=primaire.has(rol);
    h+=`<div class="slrl${isHoofd?' hoofd':''}">${rol}</div>`;
    st.forEach((s,ci)=>{
      const heeft=alleVerantw(s).includes(rol);
      const isPrimair=s.verantwoordelijke===rol;
      const heeftSub=(s.substappen||[]).length>0;
      const tc=tcls(s.type);
      h+=`<div class="slc ${heeft?'hs':''}">`;
      if(heeft){
        h+=`<div class="sls ${tc}${isPrimair?'':' mede'}" onclick="${heeftSub?`toggleN2('${s.id}')`:`showDet('${s.id}')`}" title="${s.naam}">
          <div class="sl-ico">${IC[s.type]||'?'}</div>
          <div class="sl-nm">${s.naam}</div>
          ${s.systeem?`<div class="sl-sy">${s.systeem}</div>`:''}
          ${heeftSub?`<div style="font-size:9px;font-weight:700;color:var(--gg);margin-top:2px">v${s.substappen.length} N2</div>`:''}
          ${!isPrimair?`<div style="font-size:8px;color:var(--g3);margin-top:1px">mede</div>`:''}
        </div>`;
        if(ci<st.length-1)h+=`<div class="sl-ar">&#8594;</div>`;
      }
      h+=`</div>`;
    });
  });
  cv.innerHTML=h+'</div></div>';
}
function tekenT(cv,st){
  const p=proc(S.hid);
  const kleuren=['#e8f5e9','#e3f2fd','#fce4ec','#fff8e1','#f3e5f5','#e0f7fa','#fbe9e7','#e8eaf6'];
  let h=`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th style="width:80px">Nr</th>
    <th style="width:18%">Input</th>
    <th style="width:22%">N1 Processtap</th>
    <th style="width:18%">Output</th>
    <th style="width:14%">Verantwoordelijke</th>
    <th style="width:10%">Systeem</th>
    <th style="width:80px"></th>
  </tr></thead><tbody>`;
  st.forEach((s,i)=>{
    const nr=n1Nr(p,i);
    const kleur=kleuren[i%kleuren.length];
    const heeftSub=(s.substappen||[]).length>0;
    const maxIO=Math.max(1,(s.input||[]).length,(s.output||[]).length);
    const tc=s.type;
    for(let r=0;r<maxIO;r++){
      const io_in=(s.input||[])[r];const io_out=(s.output||[])[r];
      const ei=io_in?.bron&&io_in.bron!=='intern';const eo=io_out?.doel&&io_out.doel!=='intern';
      h+=`<tr class="tbl-rij ${r===0?'tbl-rij-first':''}" style="${r===0?'background:'+kleur:''}">`;
      if(r===0)h+=`<td rowspan="${maxIO}" class="tbl-nr-cel tbl-nr-${tc}">${nr}</td>`;
      h+=`<td class="tbl-io-cel">${io_in?`<span class="${ei?'ioi ext':''}">${io_in.label}${ei?` <span class="ioe">van ${bronNm(io_in.bron)}</span>`:''}</span>`:'&nbsp;'}</td>`;
      if(r===0)h+=`<td rowspan="${maxIO}" class="tbl-stap-cel tbl-n1-cel">
        <div class="tbl-stap-ico">${IC[tc]||'?'}</div>
        <div class="tbl-stap-nm">${s.naam}</div>
        ${heeftSub?`<div class="tbl-sub-hint">v ${s.substappen.length} N2-substappen</div>`:''}
      </td>`;
      h+=`<td class="tbl-io-cel">${io_out?`<span class="${eo?'ioi ext':''}">${io_out.label}${eo?` <span class="ioe">naar ${doelNm(io_out.doel)}</span>`:''}</span>`:'&nbsp;'}</td>`;
      if(r===0){
        h+=`<td rowspan="${maxIO}" class="tbl-meta-cel">${s.verantwoordelijke||'-'}</td>`;
        h+=`<td rowspan="${maxIO}" class="tbl-meta-cel">${s.systeem?`<span class="sks">${s.systeem}</span>`:''}</td>`;
        h+=`<td rowspan="${maxIO}" class="tbl-act-cel">
          <button class="tbl-act-btn" onclick="S.bsid='${s.id}';stapModal('${s.id}')">Bewerk</button>
          <button class="tbl-act-btn tbl-act-sub ${heeftSub?'heeft':''}" onclick="openSP('${s.id}')">${heeftSub?'v'+s.substappen.length:'+ N2'}</button>
        </td>`;
      }
      h+=`</tr>`;
    }
  });
  cv.innerHTML=h+'</tbody></table></div>';
}

// ── DETAIL MODAL ──
function showDet(sid){
  const p=proc(S.hid);if(!p)return;
  const s=zoekStap(p.stappen||[],sid);if(!s)return;
  S.bsid=sid;
  document.getElementById('dett').textContent=s.naam;
  let h=`<div class="dts"><div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px">
    <span class="chip cr">${IC[s.type]} ${s.type}</span>
    ${s.verantwoordelijke?`<span class="chip cr">&#128100; ${s.verantwoordelijke}</span>`:''}
    ${s.systeem?`<span class="chip cy">${s.systeem}</span>`:''}
    ${(s.substappen||[]).length?`<span class="chip" style="background:var(--gn);color:var(--gg)">${s.substappen.length} substappen</span>`:''}
  </div>${s.beschrijving?`<p style="font-size:13px;color:var(--gs);line-height:1.6">${s.beschrijving}</p>`:''}</div>`;
  if((s.input||[]).length){h+='<div class="dts"><h3>Input</h3>';s.input.forEach(io=>{const e=io.bron&&io.bron!=='intern';h+=`<div class="ioi ${e?'ext':''}" style="margin-bottom:5px">${io.label}${e?` <span class="ioe">van ${bronNm(io.bron)}</span>`:''}</div>`;});h+='</div>';}
  if((s.output||[]).length){h+='<div class="dts"><h3>Output</h3>';s.output.forEach(io=>{const e=io.doel&&io.doel!=='intern';h+=`<div class="ioi ${e?'ext':''}" style="margin-bottom:5px">${io.label}${e?` <span class="ioe">naar ${doelNm(io.doel)}</span>`:''}</div>`;});h+='</div>';}
  document.getElementById('detb').innerHTML=h;
  document.getElementById('mdet').style.display='flex';
}
function bewerkHuidigeStap(){sluit('mdet');stapModal(S.bsid);}

// ── STAP MODAL ──
function stapModal(sid){
  S.bsid=sid||null;
  const p=proc(S.hid);if(!p)return;
  const s=sid?zoekStap(p.stappen||[],sid):null;
  const niv=huidigNiv();
  const nivLabels={1:'N1 - Overzicht (hoofdstap)',2:'N2 - Operationeel (substap van N1)',3:'N3 - Detail (substap van N2)'};
  document.getElementById('mst').textContent=s?`N${niv}-stap bewerken`:`N${niv}-stap toevoegen`;
  document.getElementById('bds').style.display=s?'':'none';
  document.getElementById('sniv-info').textContent=nivLabels[niv]||'N'+niv;
  document.getElementById('snm').value=s?.naam||'';
  document.getElementById('stp').value=s?.type||'activiteit';
  document.getElementById('sbesc').value=s?.beschrijving||'';
  const lijstLen=(niv===1?(p.stappen||[]).length:(ouderStap()?.substappen||[]).length);
  document.getElementById('svol').value=s?.volgorde||(lijstLen+1);
  vulSels();setRol(s?.verantwoordelijke||'');setSys(s?.systeem||'');
  document.getElementById('smedev').innerHTML='';(s?.medeverantwoordelijken||[]).forEach(v=>medevRij(v));
  bouwIO('in',s?.input||[]);bouwIO('out',s?.output||[]);
  document.getElementById('ms').style.display='flex';
}
function bouwIO(r,items){const el=document.getElementById('i'+r);el.innerHTML='';items.forEach(io=>ioRij(r,io));}
function ioToe(r){ioRij(r,{});}
function ioRij(r,io){
  const el=document.getElementById('i'+r);
  const div=document.createElement('div');div.className='ior';
  const v=r==='in'?'bron':'doel';const hv=io[v]||'intern';
  const lid='iorl-'+(++_iorCnt);
  const eigenLabels=ioLabelsVanProc(S.hid);
  const opts=(S.data.processen||[]).filter(p=>p.id!==S.hid).map(p=>`<option value="${p.id}" ${hv===p.id?'selected':''}>${procNr(p)} ${p.naam}</option>`).join('');
  div.innerHTML=`<input type="text" placeholder="Omschrijving" value="${io.label||''}" list="${lid}" autocomplete="off" style="flex:1">
    <datalist id="${lid}">${eigenLabels.map(l=>`<option value="${ioEscAttr(l)}">`).join('')}</datalist>
    <select onchange="ioUpdateList(this,'${r}','${lid}')"><option value="intern" ${hv==='intern'?'selected':''}>Intern</option>${opts}</select>
    <button class="iorm" onclick="this.parentElement.remove()">x</button>`;
  el.appendChild(div);
  if(hv!=='intern') ioUpdateListDirect(div.querySelector('select'),r,lid);
}
function ioEscAttr(s){return s.replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function ioLabelsVanProc(procId){
  const p=proc(procId);if(!p)return[];
  const s=new Set();
  alleStappenFlat(p.stappen||[]).forEach(st=>{
    [...(st.input||[]),...(st.output||[])].forEach(io=>{if(io.label?.trim())s.add(io.label.trim());});
  });
  return[...s].sort();
}
function ioUpdateList(sel,r,lid){ioUpdateListDirect(sel,r,lid);}
function ioUpdateListDirect(sel,r,lid){
  const dl=document.getElementById(lid);if(!dl)return;
  const eigenLabels=ioLabelsVanProc(S.hid);
  const bronId=sel.value;
  let ext=[];
  if(bronId&&bronId!=='intern'){
    const bp=proc(bronId);
    if(bp){
      const richting=r==='in'?'output':'input';
      const s=new Set();
      alleStappenFlat(bp.stappen||[]).forEach(st=>{
        (st[richting]||[]).forEach(io=>{if(io.label?.trim())s.add(io.label.trim());});
      });
      ext=[...s].sort();
    }
  }
  const alle=[...new Set([...eigenLabels,...ext])].sort();
  dl.innerHTML=alle.map(l=>`<option value="${ioEscAttr(l)}">`).join('');
}
function leesIO(r){
  const v=r==='in'?'bron':'doel';
  return Array.from(document.getElementById('i'+r).querySelectorAll('.ior')).map(rij=>{const f=rij.querySelectorAll('input,select');return{label:f[0].value,[v]:f[1].value};}).filter(io=>io.label.trim());
}
function leesRol(){const s=document.getElementById('srol');return s.value==='__vrij__'?document.getElementById('srol-vrij').value.trim():s.value;}
function leesSys(){const s=document.getElementById('ssys');return s.value==='__vrij__'?document.getElementById('ssys-vrij').value.trim():s.value;}
function setRol(v){
  const s=document.getElementById('srol'),vr=document.getElementById('srol-vrij');
  if(!v){s.value='';vr.style.display='none';return;}
  if(Array.from(s.options).find(o=>o.value===v)){s.value=v;vr.style.display='none';}
  else{s.value='__vrij__';vr.value=v;vr.style.display='block';}
}
function setSys(v){
  const s=document.getElementById('ssys'),vr=document.getElementById('ssys-vrij');
  if(!v){s.value='';vr.style.display='none';return;}
  if(Array.from(s.options).find(o=>o.value===v)){s.value=v;vr.style.display='none';}
  else{s.value='__vrij__';vr.value=v;vr.style.display='block';}
}
function rolChg(sel){const vr=document.getElementById('srol-vrij');vr.style.display=sel.value==='__vrij__'?'block':'none';if(sel.value==='__vrij__'){vr.value='';vr.focus();}}
function sysChg(sel){const vr=document.getElementById('ssys-vrij');vr.style.display=sel.value==='__vrij__'?'block':'none';if(sel.value==='__vrij__'){vr.value='';vr.focus();}}
function medevToe(){medevRij('');}
function medevRij(waarde){
  const div=document.createElement('div');div.className='ior';
  const opts=(S.data.rollen||[]).map(r=>`<option value="${r}" ${r===waarde?'selected':''}>${r}</option>`).join('');
  div.innerHTML=`<select style="flex:1;padding:5px 8px;border:1.5px solid var(--g1);border-radius:var(--r);font-family:var(--f);font-size:12px;outline:none"><option value="">-- Kies --</option>${opts}</select><button class="iorm" onclick="this.parentElement.remove()">x</button>`;
  document.getElementById('smedev').appendChild(div);
  if(!waarde)div.querySelector('select').focus();
}
function leesMedev(){
  return Array.from(document.getElementById('smedev').querySelectorAll('.ior select')).map(s=>s.value).filter(v=>v);
}

function slaStap(){
  const nm=document.getElementById('snm').value.trim();if(!nm){notif('Vul een naam in','fout');return;}
  const p=proc(S.hid);if(!p)return;
  const bestaand=S.bsid?zoekStap(p.stappen||[],S.bsid):null;
  const sd={id:S.bsid||gid('s'),naam:nm,type:document.getElementById('stp').value,verantwoordelijke:leesRol(),medeverantwoordelijken:leesMedev(),systeem:leesSys(),beschrijving:document.getElementById('sbesc').value.trim(),volgorde:parseInt(document.getElementById('svol').value)||1,input:leesIO('in'),output:leesIO('out'),substappen:bestaand?.substappen||[]};
  if(sd.verantwoordelijke&&!S.data.rollen.includes(sd.verantwoordelijke)){S.data.rollen.push(sd.verantwoordelijke);vulSels();}
  if(sd.systeem&&!S.data.systemen.includes(sd.systeem)){S.data.systemen.push(sd.systeem);vulSels();}
  const niv=huidigNiv();
  if(niv===1){
    if(!p.stappen)p.stappen=[];
    if(S.bsid){const idx=p.stappen.findIndex(s=>s.id===S.bsid);if(idx>=0)p.stappen[idx]=sd;else p.stappen.push(sd);}
    else p.stappen.push(sd);
  } else {
    let lijst=p.stappen||[];
    for(let i=0;i<S.pad.length-1;i++){const ouder=lijst.find(s=>s.id===S.pad[i]);if(!ouder)return;if(!ouder.substappen)ouder.substappen=[];lijst=ouder.substappen;}
    const directeOuder=lijst.find(s=>s.id===S.pad[S.pad.length-1]);if(!directeOuder)return;
    if(!directeOuder.substappen)directeOuder.substappen=[];
    if(S.bsid){const idx=directeOuder.substappen.findIndex(s=>s.id===S.bsid);if(idx>=0)directeOuder.substappen[idx]=sd;else directeOuder.substappen.push(sd);}
    else directeOuder.substappen.push(sd);
  }
  sluit('ms');markeer();teken();notif('Stap opgeslagen','ok');
}
function delStap(){
  if(!confirm('Stap verwijderen?'))return;
  const p=proc(S.hid);if(!p)return;
  if(!S.pad.length){p.stappen=(p.stappen||[]).filter(s=>s.id!==S.bsid);}
  else{
    let lijst=p.stappen;
    for(let i=0;i<S.pad.length-1;i++){const ouder=lijst.find(s=>s.id===S.pad[i]);if(!ouder)return;lijst=ouder.substappen||[];}
    const ouder=lijst.find(s=>s.id===S.pad[S.pad.length-1]);
    if(ouder)ouder.substappen=(ouder.substappen||[]).filter(s=>s.id!==S.bsid);
  }
  sluit('ms');markeer();teken();notif('Stap verwijderd','ok');
}

// ── PROCES MODAL ──
function vulPEig(){
  const s=document.getElementById('peig');if(!s)return;
  const hv=leesEig();
  s.innerHTML='<option value="">-- Kies eigenaar --</option>'+(S.data.rollen||[]).map(r=>`<option value="${r}">${r}</option>`).join('')+'<option value="__vrij__">Andere eigenaar...</option>';
  if(hv)setEig(hv);
}
function eigChg(sel){const vr=document.getElementById('peig-vrij');vr.style.display=sel.value==='__vrij__'?'block':'none';if(sel.value==='__vrij__'){vr.value='';vr.focus();}}
function setEig(v){
  const s=document.getElementById('peig'),vr=document.getElementById('peig-vrij');
  if(!v){s.value='';vr.style.display='none';return;}
  if(Array.from(s.options).find(o=>o.value===v)){s.value=v;vr.style.display='none';}
  else{s.value='__vrij__';vr.value=v;vr.style.display='block';}
}
function leesEig(){const s=document.getElementById('peig');if(!s)return'';return s.value==='__vrij__'?document.getElementById('peig-vrij').value.trim():s.value;}
function nieuwProcModal(){
  S.bpid=null;
  document.getElementById('mpt').textContent='Nieuw proces';
  document.getElementById('bdp').style.display='none';
  ['pnm','pbesc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pstat').value='concept';document.getElementById('pvol').value='1';
  vulPEig();setEig('');
  updPNr();document.getElementById('mp').style.display='flex';
}
function bewerkProc(){
  const p=proc(S.hid);if(!p)return;
  S.bpid=p.id;
  document.getElementById('mpt').textContent='Proces bewerken';
  document.getElementById('bdp').style.display='';
  document.getElementById('pnm').value=p.naam||'';
  document.getElementById('pcat').value=p.categorie||'';
  document.getElementById('pbesc').value=p.beschrijving||'';
  document.getElementById('pstat').value=p.status||'concept';
  document.getElementById('pvol').value=p.volgorde||1;
  vulPEig();setEig(p.eigenaar||'');
  updPNr();document.getElementById('mp').style.display='flex';
}
function updPNr(){
  const cat=document.getElementById('pcat').value;
  const volg=parseInt(document.getElementById('pvol').value)||1;
  const pre=clusterAfk(cat);
  const letter=String.fromCharCode(64+Math.min(26,volg));
  const el=document.getElementById('pnr-ex');if(el)el.textContent=pre+'-'+letter+'01';
}
function slaProc(){
  const nm=document.getElementById('pnm').value.trim();if(!nm){notif('Vul een procesnaam in','fout');return;}
  const id=S.bpid||gid('p');
  const eig=leesEig();
  if(eig&&!S.data.rollen.includes(eig)){S.data.rollen.push(eig);vulSels();}
  const pd={id,naam:nm,categorie:document.getElementById('pcat').value,niveau:S.bpid?(proc(S.bpid)?.niveau||2):2,volgorde:parseInt(document.getElementById('pvol').value)||1,eigenaar:eig,beschrijving:document.getElementById('pbesc').value.trim(),status:document.getElementById('pstat').value,versie:'0.1',aangepast:td(),stappen:S.bpid?(proc(S.bpid)?.stappen||[]):[]};
  if(S.bpid){const i=S.data.processen.findIndex(p=>p.id===S.bpid);if(i>=0)S.data.processen[i]=pd;}
  else S.data.processen.push(pd);
  sluit('mp');laadUI();markeer();notif('"'+nm+'" opgeslagen','ok');
  if(!S.bpid)sel(id);
}
function delProc(){
  const p=proc(S.hid);if(!confirm('Proces "'+p?.naam+'" verwijderen?'))return;
  S.data.processen=S.data.processen.filter(x=>x.id!==S.hid);S.hid=null;
  sluit('mp');laadUI();markeer();
  document.getElementById('canvas').innerHTML='<div class="leeg"><div class="wi">ok</div><h2>Verwijderd</h2><p>Selecteer een ander proces.</p></div>';
  document.getElementById('vt').style.display='none';
  ['bst','bbw','bib','bea'].forEach(id=>document.getElementById(id).style.display='none');
  notif('Proces verwijderd','ok');
}

// ── SELECTIES VULLEN ──
function vulSels(){
  const rollen=S.data.rollen||[];const systemen=S.data.systemen||[];
  const sr=document.getElementById('srol');
  if(sr){const hv=sr.value;sr.innerHTML='<option value="">-- Kies --</option>'+rollen.map(r=>`<option value="${r}">${r}</option>`).join('')+'<option value="__vrij__">Andere rol...</option>';if(hv)sr.value=hv;}
  const ss=document.getElementById('ssys');
  if(ss){const hv=ss.value;ss.innerHTML='<option value="">-- Geen --</option>'+systemen.map(s=>`<option value="${s}">${s}</option>`).join('')+'<option value="__vrij__">Ander systeem...</option>';if(hv)ss.value=hv;}
}
function vulCat(){
  const all=allesClusters();
  document.getElementById('pcat').innerHTML=all.map(c=>`<option value="${c.id}">${'  '.repeat(c._level)}${c.label}</option>`).join('');
}

// ── CLUSTER CRUD ──
function clusterModal(cid, ouderId){
  bewClId=cid||null;
  bewClOuderId=ouderId||null;
  const c=cid?clusterById(cid):null;
  document.getElementById('mclust-t').textContent=c?'Cluster bewerken':'Nieuw procescluster';
  document.getElementById('bclust-del').style.display=c?'':'none';
  document.getElementById('bclust-sla').disabled=false;
  document.getElementById('clust-nm').value=c?.label||'';
  document.getElementById('clust-afk').value=c?.afkorting||'';
  document.getElementById('clust-kleur').value=c?.kleur||'#00619b';
  document.getElementById('clust-vol').value=c?.volgorde||1;
  document.getElementById('clust-diepte-wrn').style.display='none';
  // Vul ouder-selector
  const sel=document.getElementById('clust-ouder');
  const flat=allesClusters().filter(x=>x.id!==cid);
  sel.innerHTML='<option value="">-- Top-niveau (geen ouder) --</option>'+
    flat.map(x=>`<option value="${x.id}">${'  '.repeat(x._level)}${x.label} (${x.afkorting||''})</option>`).join('');
  // Bepaal huidige ouder
  if(cid){
    const huidigeOuder=flat.find(x=>(x.subclusters||[]).some(s=>s.id===cid));
    if(huidigeOuder)sel.value=huidigeOuder.id;
    else sel.value='';
  } else if(ouderId){
    sel.value=ouderId;
    // Controleer diepte
    const niv=clusterNiveau(ouderId);
    if(niv>=3){
      document.getElementById('clust-diepte-wrn').style.display='';
      document.getElementById('bclust-sla').disabled=true;
    }
  }
  updClustNr();
  document.getElementById('mclust').style.display='flex';
}

function updClustNr(){
  const afk=(document.getElementById('clust-afk').value||'PB').toUpperCase();
  document.getElementById('clust-nr-ex').textContent=afk+'-A';
  const ouderId=document.getElementById('clust-ouder').value;
  const niv=ouderId?clusterNiveau(ouderId)+1:1;
  const wrn=document.getElementById('clust-diepte-wrn');
  const sla=document.getElementById('bclust-sla');
  if(niv>3){wrn.style.display='';sla.disabled=true;}
  else{wrn.style.display='none';sla.disabled=false;}
}

function slaClust(){
  const nm=document.getElementById('clust-nm').value.trim();
  if(!nm){notif('Vul een naam in','fout');return;}
  const afk=document.getElementById('clust-afk').value.trim().toUpperCase();
  if(!afk){notif('Vul een afkorting in','fout');return;}
  const kleur=document.getElementById('clust-kleur').value;
  const vol=parseInt(document.getElementById('clust-vol').value)||1;
  const ouderId=document.getElementById('clust-ouder').value;
  if(bewClId){
    // Bewerken
    const c=clusterById(bewClId);
    if(c){c.label=nm;c.afkorting=afk;c.kleur=kleur;c.volgorde=vol;}
  } else {
    // Nieuw
    if(ouderId&&clusterNiveau(ouderId)>=3){notif('Maximum 3 niveaus bereikt','fout');return;}
    const nc={id:gid('cl'),label:nm,afkorting:afk,kleur,volgorde:vol,subclusters:[]};
    uitCl.add(nc.id);
    if(ouderId){
      const ouder=clusterById(ouderId);
      if(ouder){if(!ouder.subclusters)ouder.subclusters=[];ouder.subclusters.push(nc);}
    } else {
      S.data.clusters.push(nc);
    }
  }
  sluit('mclust');laadUI();markeer();notif('"'+nm+'" opgeslagen','ok');
}

function delClust(){
  if(!bewClId)return;
  const c=clusterById(bewClId);
  const cIds=alleClusterIds(c||{id:bewClId,subclusters:[]});
  const inGebruik=(S.data.processen||[]).filter(p=>cIds.includes(p.categorie));
  const berichtDeel=inGebruik.length?` (${inGebruik.length} processen worden losgekoppeld)`:'';
  if(!confirm(`Cluster "${c?.label||bewClId}" verwijderen?${berichtDeel}`))return;
  function removeFromTree(l){const i=l.findIndex(x=>x.id===bewClId);if(i>=0){l.splice(i,1);return true;}return l.some(x=>removeFromTree(x.subclusters||[]));}
  removeFromTree(S.data.clusters);
  uitCl.delete(bewClId);
  sluit('mclust');laadUI();markeer();notif('Cluster verwijderd','ok');
}

function bouwBeheerClusters(){
  const el=document.getElementById('beh-clusters');
  if(!el)return;
  function renderC(c,depth){
    const pad=depth*14;
    let h=`<div style="margin-left:${pad}px;margin-bottom:1px">
      <div class="beh-rij">
        <span style="flex:1;display:flex;align-items:center;gap:6px">
          <span style="width:9px;height:9px;border-radius:50%;background:${c.kleur||'#888'};flex-shrink:0;display:inline-block"></span>
          <strong style="font-size:13px;color:var(--gd)">${c.label}</strong>
          <span style="font-family:var(--m);font-size:10px;color:var(--g3)">${c.afkorting||''}</span>
        </span>
        <button class="beh-edit" onclick="clusterModal('${c.id}')">Bewerk</button>
        <button class="beh-edit" onclick="sluit('mbeh');clusterModal(null,'${c.id}')">+ Sub</button>
        <button class="beh-del" onclick="bewClId='${c.id}';delClust()">x</button>
      </div>`;
    (c.subclusters||[]).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)).forEach(sc=>{h+=renderC(sc,depth+1);});
    h+='</div>';
    return h;
  }
  let h='';
  (S.data.clusters||[]).sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)).forEach(c=>{h+=renderC(c,0);});
  el.innerHTML=h||'<p style="font-size:12px;color:var(--g3);padding:6px 0">Nog geen clusters.</p>';
}

// ── BEHEER MODAL ──
function beheerModal(){
  bouwBeheerClusters();
  bouwBeheer('rollen','beh-rollen');bouwBeheer('systemen','beh-sys');bouwBeheerDoc();
  document.getElementById('mbeh').style.display='flex';
}
function bouwBeheer(sl,cid){
  const el=document.getElementById(cid);const items=S.data[sl]||[];
  if(!items.length){el.innerHTML='<p style="font-size:12px;color:var(--g3);padding:6px 0">Nog geen items.</p>';return;}
  el.innerHTML=items.map((item,i)=>`
    <div class="beh-rij" id="br-${sl}-${i}">
      <span>${item}</span>
      <input value="${item}">
      <button class="beh-edit" onclick="behEdit('${sl}',${i})">Bewerk</button>
      <button class="beh-save" onclick="behSave('${sl}',${i})">OK</button>
      <button class="beh-del" onclick="behDel('${sl}',${i})">x</button>
    </div>`).join('');
}
function behEdit(sl,i){
  const rij=document.getElementById('br-'+sl+'-'+i);
  rij.querySelector('span').style.display='none';rij.querySelector('input').style.display='block';rij.querySelector('.beh-edit').style.display='none';rij.querySelector('.beh-save').style.display='';rij.querySelector('input').focus();
}
function behSave(sl,i){
  const nieuw=document.getElementById('br-'+sl+'-'+i).querySelector('input').value.trim();
  if(!nieuw){notif('Naam mag niet leeg zijn','fout');return;}
  S.data[sl][i]=nieuw;bouwBeheer(sl,'beh-'+(sl==='rollen'?'rollen':'sys'));vulSels();markeer();notif('Opgeslagen','ok');
}
function behDel(sl,i){
  if(!confirm('"'+S.data[sl][i]+'" verwijderen?'))return;
  S.data[sl].splice(i,1);bouwBeheer(sl,'beh-'+(sl==='rollen'?'rollen':'sys'));vulSels();markeer();notif('Verwijderd','ok');
}
function rolToe(){
  const v=document.getElementById('beh-rol-n').value.trim();if(!v){notif('Vul een rol in','fout');return;}
  if(S.data.rollen.includes(v)){notif('Bestaat al','fout');return;}
  S.data.rollen.push(v);document.getElementById('beh-rol-n').value='';bouwBeheer('rollen','beh-rollen');vulSels();markeer();notif('"'+v+'" toegevoegd','ok');
}
function sysToe(){
  const v=document.getElementById('beh-sys-n').value.trim();if(!v){notif('Vul een systeem in','fout');return;}
  if(S.data.systemen.includes(v)){notif('Bestaat al','fout');return;}
  S.data.systemen.push(v);document.getElementById('beh-sys-n').value='';bouwBeheer('systemen','beh-sys');vulSels();markeer();notif('"'+v+'" toegevoegd','ok');
}
function bouwBeheerDoc(){
  const el=document.getElementById('beh-doc');
  const items=S.data.documenten||[];
  if(!items.length){el.innerHTML='<p style="font-size:12px;color:var(--g3);padding:6px 0">Nog geen documenten.</p>';return;}
  el.innerHTML=items.map((doc,i)=>`
    <div class="beh-rij" id="br-doc-${i}">
      <span style="flex:1;font-size:13px;color:var(--gd)"><span style="font-weight:600;color:var(--ga)">${doc.code}</span> — ${doc.naam}</span>
      <div style="display:none;flex:1;gap:6px">
        <input value="${doc.code}" placeholder="Code" style="width:130px;flex:none;padding:5px 8px;border:1.5px solid var(--g1);border-radius:var(--r);font-family:var(--f);font-size:13px;outline:none">
        <input value="${doc.naam}" placeholder="Naam" style="flex:1;padding:5px 8px;border:1.5px solid var(--g1);border-radius:var(--r);font-family:var(--f);font-size:13px;outline:none">
      </div>
      <button class="beh-edit" onclick="behDocEdit(${i})">Bewerk</button>
      <button class="beh-save" onclick="behDocSave(${i})" style="display:none">OK</button>
      <button class="beh-del" onclick="behDocDel(${i})">x</button>
    </div>`).join('');
}
function behDocEdit(i){
  const rij=document.getElementById('br-doc-'+i);
  rij.querySelector('span').style.display='none';
  rij.querySelector('div').style.display='flex';
  rij.querySelector('.beh-edit').style.display='none';
  rij.querySelector('.beh-save').style.display='';
  rij.querySelectorAll('input')[1].focus();
}
function behDocSave(i){
  const rij=document.getElementById('br-doc-'+i);
  const ins=rij.querySelectorAll('input');
  const code=ins[0].value.trim(),naam=ins[1].value.trim();
  if(!code||!naam){notif('Code en naam zijn verplicht','fout');return;}
  const bestaatAl=(S.data.documenten||[]).findIndex(d=>d.code===code);
  if(bestaatAl!==-1&&bestaatAl!==i){notif('Code bestaat al','fout');return;}
  S.data.documenten[i]={code,naam};bouwBeheerDoc();markeer();notif('Opgeslagen','ok');
}
function behDocDel(i){
  const doc=(S.data.documenten||[])[i];
  if(!confirm('"'+doc.code+' — '+doc.naam+'" verwijderen?'))return;
  S.data.documenten.splice(i,1);bouwBeheerDoc();markeer();notif('Verwijderd','ok');
}
function docToe(){
  const code=document.getElementById('beh-doc-code').value.trim();
  const naam=document.getElementById('beh-doc-nm').value.trim();
  if(!code){notif('Vul een code in','fout');return;}
  if(!naam){notif('Vul een naam in','fout');return;}
  if(!S.data.documenten)S.data.documenten=[];
  if(S.data.documenten.find(d=>d.code===code)){notif('Code "'+code+'" bestaat al','fout');return;}
  S.data.documenten.push({code,naam});
  document.getElementById('beh-doc-code').value='';document.getElementById('beh-doc-nm').value='';
  bouwBeheerDoc();markeer();notif('"'+code+' '+naam+'" toegevoegd','ok');
}
function docNaam(code){
  if(!code||code==='intern')return '';
  return (S.data.documenten||[]).find(d=>d.code===code)?.naam||'';
}

// ── LADEN & OPSLAAN ──
function verwerkLaadData(tekst, handle){
  try{
    const d=JSON.parse(tekst);
    if((d.clusters||d.categorieen)&&d.processen){
      migr(d);S.data=d;S.hid=null;S.pad=[];
      uitCl=new Set();allesClusters().forEach(c=>uitCl.add(c.id));
      jsonFileHandle=handle||null;
      document.getElementById('bos-als').style.display=handle?'':'none';
      laadUI();try{localStorage.setItem('ipp_v2',JSON.stringify(S.data));}catch(e){}setGw(false);
      document.getElementById('canvas').innerHTML='<div class="leeg"><div class="wi">ok</div><h2>Project geladen</h2><p>Selecteer een proces in de sidebar.</p></div>';
      document.getElementById('vt').style.display='none';['bst','bbw','bib','bea'].forEach(id=>document.getElementById(id).style.display='none');document.getElementById('wbs').textContent='';
      notif('Geladen: '+d.processen.length+' processen','ok');
    }else notif('Onbekend bestandsformaat','fout');
  }catch{notif('Ongeldig JSON-bestand','fout');}
}
async function laadBestand(){
  if('showOpenFilePicker' in window){
    try{
      const [handle]=await window.showOpenFilePicker({types:[{description:'JSON bestand',accept:{'application/json':['.json']}}]});
      const file=await handle.getFile();
      verwerkLaadData(await file.text(), handle);
    }catch(e){if(e.name!=='AbortError')notif('Kon bestand niet openen','fout');}
  } else {
    const inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.onchange=e=>{
      const f=e.target.files[0];if(!f)return;
      const r=new FileReader();r.onload=ev=>verwerkLaadData(ev.target.result,null);r.readAsText(f);
    };inp.click();
  }
}

// ── RELATICS CSV IMPORT ──
async function importeerRelatics(){
  if('showOpenFilePicker' in window){
    try{
      const [fh]=await window.showOpenFilePicker({types:[{description:'CSV bestand',accept:{'text/csv':['.csv']}}]});
      verwerkRelaticsCSV(await(await fh.getFile()).text());
    }catch(e){if(e.name!=='AbortError')notif('Kon CSV niet openen','fout');}
  }else{
    const inp=document.createElement('input');inp.type='file';inp.accept='.csv';
    inp.onchange=async()=>{if(inp.files[0])verwerkRelaticsCSV(await inp.files[0].text());};
    inp.click();
  }
}

function verwerkRelaticsCSV(csvTekst){
  try{
    const regels=csvTekst.replace(/\r/g,'').split('\n');
    const wsMap={};
    let huidigId=null,huidigAct=null;

    // Kolom "A - accountable" (RASCI) opzoeken in 2e headerrij — alleen aanwezig in RACI-formaat
    const headerRij2=(regels[1]||'').split(';').map(h=>h.trim().toLowerCase());
    const accCol=headerRij2.indexOf('a - accountable');
    const haalAcc=c=>accCol<0?'':c(accCol).replace(/^rol-\d+\s*/i,'').trim();

    // Meerdelige volgordenummers (bv. "3.5.1") vergelijkbaar maken
    function parseVol(s){
      if(!s||!s.trim())return 99999;
      const p=s.trim().split('.').map(n=>parseInt(n)||0);
      return p[0]*10000+(p[1]||0)*100+(p[2]||0);
    }

    // CSV inlezen (sla 2 headerrijen over)
    for(let i=2;i<regels.length;i++){
      const r=regels[i].split(';');
      const c=n=>(r[n]||'').trim();
      // Nieuwe werkspoor-rij
      if(c(0).startsWith('IPP-')){
        huidigId=c(0);huidigAct=null;
        if(!wsMap[huidigId])wsMap[huidigId]={id:huidigId,naam:c(1),parentId:c(2)||null,subs:[],acts:[]};
      }
      if(!huidigId)continue;
      const ws=wsMap[huidigId];
      // Sub-werkspoor (col 5-6) → dit werkspoor is een cluster
      if(c(5).startsWith('IPP-')&&!ws.subs.find(s=>s.id===c(5)))
        ws.subs.push({id:c(5),volgorde:parseVol(c(6))});
      // Nieuwe activiteit (col 8-10) → processtap
      if(c(8).startsWith('ACT-')&&c(10)){
        huidigAct={id:c(8),volgorde:c(9)?parseInt(c(9)):null,naam:c(10),systemen:[],inputs:[],outputs:[],verantwoordelijke:haalAcc(c)};
        ws.acts.push(huidigAct);
      }
      // Tools / output / input / verantwoordelijke toevoegen aan huidige activiteit (ook vervolgrijen)
      if(huidigAct){
        if(c(12)&&!huidigAct.systemen.includes(c(12)))huidigAct.systemen.push(c(12));
        if(c(14))huidigAct.outputs.push({code:c(13),naam:c(14)});
        if(c(16))huidigAct.inputs.push({code:c(15),naam:c(16)});
        if(!huidigAct.verantwoordelijke&&haalAcc(c))huidigAct.verantwoordelijke=haalAcc(c);
      }
    }

    // Cluster vs proces: werkspoor met sub-werksporen = cluster
    const isCluster={};
    for(const id in wsMap)isCluster[id]=wsMap[id].subs.length>0;

    // IPP-6 → ipp_6  (deterministisch, geen lookup nodig)
    const aId=id=>(id||'').toLowerCase().replace(/-/g,'_');

    // 2-3-letter afkorting afleiden uit naam
    function afk(naam){
      const sw=new Set(['en','van','de','het','der','aan','bij','met','in','voor','op','als','om']);
      const wrd=naam.replace(/[()\/&-]/g,' ').split(/\s+/).filter(w=>w.length>1&&!sw.has(w.toLowerCase()));
      if(wrd.length>=3)return(wrd[0][0]+wrd[1][0]+wrd[2][0]).toUpperCase();
      if(wrd.length===2)return(wrd[0].slice(0,2)+wrd[1][0]).toUpperCase();
      return(wrd[0]||naam).slice(0,3).toUpperCase();
    }

    const kleuren=['#1a3c34','#2d6a4f','#40916c','#52b788','#74c69d','#b7e4c7','#8ecae6','#219ebc','#6a4c93','#023047','#e63946','#ffb703'];
    let ki=0;

    function bouwCluster(id,vol){
      const ws=wsMap[id];if(!ws)return null;
      const cl={id:aId(id),label:ws.naam,kleur:kleuren[ki++%kleuren.length],afkorting:afk(ws.naam),volgorde:vol,subclusters:[]};
      ws.subs.slice().sort((a,b)=>a.volgorde-b.volgorde).forEach(sub=>{
        if(isCluster[sub.id]){const sc=bouwCluster(sub.id,sub.volgorde);if(sc)cl.subclusters.push(sc);}
      });
      return cl;
    }

    // Root-clusters: werksporen waarvan de parent NIET in wsMap zit
    const heeftParentInMap=new Set(Object.values(wsMap).filter(w=>w.parentId&&wsMap[w.parentId]).map(w=>w.id));
    const roots=Object.keys(wsMap).filter(id=>!heeftParentInMap.has(id)&&isCluster[id]);
    const clusters=roots.map((id,i)=>bouwCluster(id,i+1)).filter(Boolean);

    // Processen opbouwen
    const alleSystemen=new Set(S.data?.systemen||leeg().systemen);
    const alleRollen=new Set(S.data?.rollen||leeg().rollen);
    const processen=[];

    for(const id in wsMap){
      if(isCluster[id])continue;           // clusters overslaan
      const ws=wsMap[id];
      if(!ws.parentId)continue;            // werksporen zonder parent overslaan
      const parentWs=wsMap[ws.parentId];
      const subEntry=parentWs?.subs.find(s=>s.id===id);
      const vol=subEntry?subEntry.volgorde:99999;

      // Activiteiten sorteren: op volgorde als aanwezig, anders volgorde in bestand
      const sortedActs=ws.acts.some(a=>a.volgorde!==null)
        ?[...ws.acts].sort((a,b)=>(a.volgorde??999)-(b.volgorde??999))
        :[...ws.acts];

      const stappen=sortedActs.map((act,si)=>{
        act.systemen.forEach(s=>alleSystemen.add(s));
        if(act.verantwoordelijke)alleRollen.add(act.verantwoordelijke);
        const stap={
          id:gid('s'),naam:act.naam,type:'activiteit',
          verantwoordelijke:act.verantwoordelijke||'',systeem:act.systemen.join('; '),
          beschrijving:'',volgorde:act.volgorde??si+1,
          status:'concept',substappen:[],medeverantwoordelijken:[],
          input:act.inputs.map(inp=>({label:inp.naam,bron:inp.code||'intern'})),
          output:act.outputs.map(o=>({label:o.naam,doel:o.code||'intern'}))
        };
        return stap;
      });

      processen.push({id:gid('p'),naam:ws.naam,categorie:aId(ws.parentId),
        niveau:2,volgorde:vol,eigenaar:'',beschrijving:'',
        status:'concept',versie:'0.1',aangepast:td(),stappen});
    }

    // Documenten: alle unieke PRD-codes uit inputs en outputs verzamelen
    const docMap={};
    for(const id in wsMap){
      for(const act of wsMap[id].acts){
        for(const o of act.outputs){if(o.code&&o.code!=='intern'&&!docMap[o.code])docMap[o.code]=o.naam;}
        for(const inp of act.inputs){if(inp.code&&inp.code!=='intern'&&!docMap[inp.code])docMap[inp.code]=inp.naam;}
      }
    }
    const documenten=Object.entries(docMap).map(([code,naam])=>({code,naam})).sort((a,b)=>a.code.localeCompare(b.code));

    S.data={versie:'1.1',project:'IPP Procesmanagement Antea Group',aangepast:td(),
      clusters,rollen:[...alleRollen],
      systemen:[...alleSystemen],documenten,eaLinks:[],processen};

    S.hid=null;S.pad=[];uitCl=new Set();
    allesClusters().forEach(c=>uitCl.add(c.id));
    jsonFileHandle=null;
    document.getElementById('bos-als').style.display='none';
    laadUI();
    try{localStorage.setItem('ipp_v2',JSON.stringify(S.data));}catch(e){}
    setGw(true);
    document.getElementById('canvas').innerHTML='<div id="wlk"><div class="wi">&#10003;</div><h2>Relatics geïmporteerd</h2><p>'+processen.length+' processen · '+clusters.length+' clusters · '+documenten.length+' documenten geladen.<br>Gebruik <strong>Opslaan</strong> om op te slaan als JSON.</p></div>';
    document.getElementById('vt').style.display='none';
    ['bst','bbw','bib','bea'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById('wbs').textContent='';
    notif('Relatics: '+processen.length+' processen geladen','ok');

  }catch(e){console.error(e);notif('Fout bij Relatics import: '+e.message,'fout');}
}

// ── RELATICS SE CSV IMPORT ──
// Kolommen (0-based, puntkomma-gescheiden):
// 0=PRC-id  1=Code  2=Naam  3=ouderPRC-id  4=ouderCode  5=ouderNaam
// 6=subPRC-id  7=subCode  8=subNaam  9=inputDocCode  10=inputDocNaam
// 11=outputDocCode  12=outputDocNaam
// Niveau bepaald door aantal numerieke segmenten in Code na het koppelteken:
//   1 segment (KP-1)        → cluster
//   2 segmenten (KP-1.1)    → proces
//   3 segmenten (KP-1.1.1)  → N1-stap
//   4 segmenten (KP-1.1.1.1)→ N2-substap
async function importeerRelaticsSE(){
  if('showOpenFilePicker' in window){
    try{
      const [fh]=await window.showOpenFilePicker({types:[{description:'CSV bestand',accept:{'text/csv':['.csv']}}]});
      verwerkRelaticsSECSV(await(await fh.getFile()).text());
    }catch(e){if(e.name!=='AbortError')notif('Kon CSV niet openen','fout');}
  }else{
    const inp=document.createElement('input');inp.type='file';inp.accept='.csv';
    inp.onchange=async()=>{if(inp.files[0])verwerkRelaticsSECSV(await inp.files[0].text());};
    inp.click();
  }
}

function verwerkRelaticsSECSV(csvTekst){
  try{
    const regels=csvTekst.replace(/^﻿/,'').replace(/\r/g,'').split('\n');
    // rijen 0 en 1 zijn headers — sla over
    const recs={}; // prcId → record
    const volg=[]; // volgorde van prcIds
    let hid=null;

    for(let i=2;i<regels.length;i++){
      const r=regels[i].split(';');
      const c=n=>(r[n]||'').trim();
      if(r.every(v=>!v.trim()))continue;

      if(c(0).startsWith('PRC-')){
        hid=c(0);
        if(!recs[hid]){
          recs[hid]={prcId:c(0),code:c(1),naam:c(2),ouderPrcId:c(3),
            subProcs:[],inputDocs:[],outputDocs:[]};
          volg.push(hid);
        }
      }
      if(!hid||!recs[hid])continue;
      const rc=recs[hid];
      if(c(6).startsWith('PRC-')&&!rc.subProcs.find(s=>s.prcId===c(6)))
        rc.subProcs.push({prcId:c(6),code:c(7),naam:c(8)});
      if(c(10)&&!rc.inputDocs.find(d=>d.naam===c(10)))
        rc.inputDocs.push({code:c(9),naam:c(10)});
      if(c(12)&&!rc.outputDocs.find(d=>d.naam===c(12)))
        rc.outputDocs.push({code:c(11),naam:c(12)});
    }

    // Aantal numerieke segmenten in code bepaalt het niveau
    function seNiv(code){
      const d=code.indexOf('-');if(d<0)return 0;
      const rest=code.slice(d+1);
      if(!/^[\d.]+$/.test(rest))return 0; // bijv. SE-AG → overslaan
      return rest.split('.').length;
    }
    // Sorteersleutel op basis van code-segmenten
    function seVol(code){
      const d=code.indexOf('-');if(d<0)return[999];
      return code.slice(d+1).split('.').map(n=>parseInt(n)||0);
    }
    function seVolCmp(a,b){
      const av=seVol(a.code),bv=seVol(b.code);
      for(let i=0;i<Math.max(av.length,bv.length);i++){
        const df=(av[i]||0)-(bv[i]||0);if(df)return df;
      }
      return 0;
    }

    const n1=[],n2=[],n3=[],n4=[];
    volg.forEach(id=>{
      const r=recs[id],niv=seNiv(r.code);
      if(niv===1)n1.push(r);
      else if(niv===2)n2.push(r);
      else if(niv===3)n3.push(r);
      else if(niv>=4)n4.push(r);
    });

    const seKleuren=['#004874','#00619b','#007ac2','#00619b','#004874','#80bde1','#f0a500','#007ac2','#004874','#00619b'];
    let ki=0;
    function afk(naam){
      const sw=new Set(['en','van','de','het','der','aan','bij','met','in','voor','op','als','om','of']);
      const wrd=naam.replace(/[()\/&\-]/g,' ').split(/\s+/).filter(w=>w.length>1&&!sw.has(w.toLowerCase()));
      if(wrd.length>=3)return(wrd[0][0]+wrd[1][0]+wrd[2][0]).toUpperCase();
      if(wrd.length===2)return(wrd[0].slice(0,2)+wrd[1][0]).toUpperCase();
      return(wrd[0]||naam).slice(0,3).toUpperCase();
    }

    // Clusters uit niveau-1 records
    const clusters=n1.slice().sort(seVolCmp).map((r,idx)=>({
      id:'se_'+r.prcId.toLowerCase().replace('-','_'),
      label:r.naam,
      afkorting:r.code.split('-')[0]||afk(r.naam),
      kleur:seKleuren[ki++%seKleuren.length],
      volgorde:idx+1,
      subclusters:[]
    }));

    // Processen uit niveau-2 records
    const processen=[];
    n2.slice().sort(seVolCmp).forEach((r,pi)=>{
      const ouderRec=recs[r.ouderPrcId];
      const categorieId=ouderRec?'se_'+r.ouderPrcId.toLowerCase().replace('-','_'):(clusters[0]?.id||'');

      // N1-stappen: niveau-3 records met dit proces als parent
      const stappen=n3.filter(s=>s.ouderPrcId===r.prcId).slice().sort(seVolCmp).map((s,si)=>{
        // N2-substappen: niveau-4 records met deze stap als parent
        const substappen=n4.filter(ss=>ss.ouderPrcId===s.prcId).slice().sort(seVolCmp).map((ss,ssi)=>({
          id:gid('s'),naam:ss.naam,type:'activiteit',volgorde:ssi+1,
          verantwoordelijke:'',systeem:'',beschrijving:'',status:'concept',
          substappen:[],medeverantwoordelijken:[],
          input:ss.inputDocs.map(d=>({label:d.naam,bron:'intern'})),
          output:ss.outputDocs.map(d=>({label:d.naam,doel:'intern'}))
        }));
        return{
          id:gid('s'),naam:s.naam,type:'activiteit',volgorde:si+1,
          verantwoordelijke:'',systeem:'',beschrijving:'',status:'concept',
          substappen,medeverantwoordelijken:[],
          input:s.inputDocs.map(d=>({label:d.naam,bron:'intern'})),
          output:s.outputDocs.map(d=>({label:d.naam,doel:'intern'}))
        };
      });

      processen.push({id:gid('p'),naam:r.naam,categorie:categorieId,
        niveau:2,volgorde:pi+1,eigenaar:'',beschrijving:'',
        status:'concept',versie:'0.1',aangepast:td(),stappen});
    });

    // Unieke documenten verzamelen
    const docMap={};
    [...n3,...n4].forEach(s=>{
      [...s.inputDocs,...s.outputDocs].forEach(d=>{if(d.code&&!docMap[d.code])docMap[d.code]=d.naam;});
    });
    const documenten=Object.entries(docMap).map(([code,naam])=>({code,naam})).sort((a,b)=>a.code.localeCompare(b.code));

    S.data={versie:'1.1',project:'SE Procesmanagement Antea Group',aangepast:td(),
      clusters,rollen:[...leeg().rollen],systemen:[...leeg().systemen],
      documenten,eaLinks:[],processen};

    S.hid=null;S.pad=[];uitCl=new Set();
    allesClusters().forEach(c=>uitCl.add(c.id));
    jsonFileHandle=null;
    document.getElementById('bos-als').style.display='none';
    laadUI();
    try{localStorage.setItem('ipp_v2',JSON.stringify(S.data));}catch(e){}
    setGw(true);
    document.getElementById('canvas').innerHTML='<div id="wlk"><div class="wi">&#10003;</div><h2>Relatics SE ge&iuml;mporteerd</h2><p>'+processen.length+' processen &middot; '+clusters.length+' clusters &middot; '+documenten.length+' documenten geladen.<br>Gebruik <strong>Opslaan</strong> om op te slaan als JSON.</p></div>';
    document.getElementById('vt').style.display='none';
    ['bst','bbw','bib','bea'].forEach(id=>document.getElementById(id).style.display='none');
    document.getElementById('wbs').textContent='';
    notif('Relatics SE: '+processen.length+' processen geladen','ok');

  }catch(e){console.error(e);notif('Fout bij SE-import: '+e.message,'fout');}
}

async function opslaanJSON(){
  if(!S.data)return;
  S.data.aangepast=td();
  const inhoud=JSON.stringify(S.data,null,2);
  if('showSaveFilePicker' in window){
    try{
      if(!jsonFileHandle){
        const nm=(S.data.project||'ipp').replace(/\s+/g,'-').toLowerCase();
        jsonFileHandle=await window.showSaveFilePicker({suggestedName:nm+'.json',types:[{description:'JSON bestand',accept:{'application/json':['.json']}}]});
        document.getElementById('bos-als').style.display='';
      }
      const w=await jsonFileHandle.createWritable();
      await w.write(inhoud);await w.close();
      try{localStorage.setItem('ipp_v2',inhoud);}catch(e){}
      setGw(false);notif('Opgeslagen: '+jsonFileHandle.name,'ok');
      return;
    }catch(e){
      if(e.name==='AbortError')return;
      jsonFileHandle=null;
    }
  }
  // Fallback: download
  const blob=new Blob([inhoud],{type:'application/json'});
  const nm=(S.data.project||'ipp').replace(/\s+/g,'-').toLowerCase();
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nm+'.json';a.click();URL.revokeObjectURL(a.href);
  try{localStorage.setItem('ipp_v2',inhoud);}catch(e){}
  setGw(false);notif('Opgeslagen als JSON','ok');
}
async function opslaanAls(){
  jsonFileHandle=null;
  document.getElementById('bos-als').style.display='none';
  await opslaanJSON();
}
function exportPDF(){
  if(!S.hid){notif('Selecteer eerst een proces','fout');return;}
  const p=proc(S.hid);const orig=document.title;
  document.title=(p?.naam||'Proces')+' - IPP Antea Group';
  const st=document.createElement('style');st.id='pst';
  st.textContent='@media print{@page{size:A4 landscape;margin:12mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  document.head.appendChild(st);window.print();
  setTimeout(()=>{document.title=orig;document.getElementById('pst')?.remove();},1000);
}

// ── CSV ──
function csvWizard(){
  const sel=document.getElementById('csv-ps');
  sel.innerHTML='<option value="">-- Kies --</option>'+(S.data?.processen||[]).map(p=>`<option value="${p.id}">${procNr(p)} ${p.naam}</option>`).join('');
  document.getElementById('csv-nc').innerHTML=allesClusters().map(c=>`<option value="${c.id}">${'  '.repeat(c._level)}${c.label}</option>`).join('');
  document.getElementById('csv-s1').style.display='';document.getElementById('csv-s2').style.display='none';
  document.getElementById('csv-do').style.display='none';csvBuf=null;
  document.getElementById('mcsv').style.display='flex';
}
function csvExport(){
  const id=document.getElementById('csv-ps').value;if(!id){notif('Selecteer een proces','fout');return;}
  const p=proc(id);if(!p)return;
  dlCSV(p);notif('CSV geexporteerd: '+p.naam,'ok');
}
function csvNieuwExport(){
  const nm=document.getElementById('csv-nn').value.trim();const cat=document.getElementById('csv-nc').value;
  if(!nm){notif('Vul een naam in','fout');return;}
  const id=gid('p');
  const np={id,naam:nm,categorie:cat,niveau:2,volgorde:1,eigenaar:'',beschrijving:'',status:'concept',versie:'0.1',aangepast:td(),stappen:[]};
  S.data.processen.push(np);laadUI();markeer();notif('"'+nm+'" aangemaakt','ok');dlCSV(np);
}
function dlCSV(p){
  const pr=procNr(p);
  const rollen=(S.data?.rollen||[]).join(' | ');
  const systemen=(S.data?.systemen||[]).join(' | ');
  const meta=['# IPP Procesmanager - CSV Export','# Proces: '+p.naam+' ('+p.id+')','# Geexporteerd: '+td(),'# ','# GELDIGE WAARDEN:','# type: activiteit | beslissing | start | einde | document','# verantwoordelijke: '+rollen,'# systeem: '+systemen,'# ','# NUMMERING: '+pr+'01 (N1), '+pr+'01.01 (N2), '+pr+'01.01.01 (N3)','# ouder_stap_nr: leeg=N1, '+pr+'01=N2, '+pr+'01.01=N3','# '].join('\n');
  const header=CSV_COLS.join(';');
  const rijen=[];
  const li={v:0};
  flatCSV(p.stappen||[],p.id,p.naam,p,rijen,1,li);
  if(!rijen.length)rijen.push([p.id,p.naam,pr+'01','','Eerste stap','activiteit','','','','','','','','','','','','','','','',1,'concept'].map(v=>csvEsc(String(v))).join(';'));
  const inhoud=meta+'\n'+header+'\n'+rijen.join('\n');
  const blob=new Blob([inhoud],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=p.id+'_import.csv';a.click();URL.revokeObjectURL(a.href);
}
function flatCSV(stappen,pid,pnaam,p,rijen,niv,li,ouderNr){
  stappen.sort((a,b)=>(a.volgorde||0)-(b.volgorde||0)).forEach((s,i)=>{
    const pref=procNr(p);let nr;
    if(niv===1){nr=pref+String(li.v+1).padStart(2,'00').slice(-2);li.v++;}
    else{nr=ouderNr+'.'+String(i+1).padStart(2,'00').slice(-2);}
    const inp=s.input||[];const out=s.output||[];
    rijen.push([pid,pnaam,nr,ouderNr||'',s.naam,s.type||'activiteit',s.verantwoordelijke||'',s.systeem||'',s.beschrijving||'',inp[0]?.label||'',inp[0]?.bron||'',inp[1]?.label||'',inp[1]?.bron||'',inp[2]?.label||'',inp[2]?.bron||'',out[0]?.label||'',out[0]?.doel||'',out[1]?.label||'',out[1]?.doel||'',out[2]?.label||'',out[2]?.doel||'',s.volgorde||i+1,s.status||''].map(v=>csvEsc(String(v))).join(';'));
    if((s.substappen||[]).length)flatCSV(s.substappen,pid,pnaam,p,rijen,niv+1,li,nr);
  });
}
function csvEsc(v){if(v.includes(';')||v.includes('"')||v.includes('\n'))return '"'+v.replace(/"/g,'""')+'"';return v;}
function csvStap2(){
  document.getElementById('csv-s1').style.display='none';document.getElementById('csv-s2').style.display='';
  document.getElementById('csv-do').style.display='';csvBuf=null;
  document.getElementById('csv-file').value='';
  document.getElementById('csv-prev').style.display='none';document.getElementById('csv-err').style.display='none';
  document.getElementById('csv-file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>verwerkCSV(ev.target.result);r.readAsText(f,'UTF-8');};
}
function verwerkCSV(tekst){
  const err=document.getElementById('csv-err'),prev=document.getElementById('csv-prev');
  err.style.display='none';prev.style.display='none';csvBuf=null;
  try{
    const regels=tekst.split('\n').map(r=>r.trimEnd()).filter(r=>r.trim()&&!r.startsWith('#'));
    if(regels.length<2)throw new Error('Geen data-regels gevonden.');
    const kols=regels[0].split(';').map(k=>k.trim().toLowerCase());
    const idx=k=>kols.indexOf(k);
    for(const k of ['proces_id','stap_nr','stap_naam'])if(idx(k)<0)throw new Error('Kolom ontbreekt: '+k);
    const pMap={};
    regels.slice(1).filter(r=>r.trim()).forEach((regel,ri)=>{
      const cellen=csvParsRegel(regel);
      const get=k=>(cellen[idx(k)]||'').trim();
      const pid=get('proces_id'),nr=get('stap_nr'),ouder=get('ouder_stap_nr'),naam=get('stap_naam');
      if(!pid||!nr||!naam)return;
      if(!pMap[pid])pMap[pid]={naam:get('proces_naam')||pid,stappen:[]};
      const stap={id:gid('s'),naam,type:get('type')||'activiteit',verantwoordelijke:get('verantwoordelijke'),systeem:get('systeem'),beschrijving:get('beschrijving'),volgorde:parseInt(get('volgorde'))||ri+1,input:bouwIOcsv(cellen,idx,'input'),output:bouwIOcsv(cellen,idx,'output'),substappen:[],_nr:nr,_ouder:ouder};
      pMap[pid].stappen.push(stap);
    });
    const res={};
    const waarschuwingen=[];
    for(const [pid,pd] of Object.entries(pMap)){
      const nrMap={};pd.stappen.forEach(s=>nrMap[s._nr]=s);
      const wortel=[];
      pd.stappen.forEach(s=>{
        if(!s._ouder){
          wortel.push(s);
        } else {
          const ouder=nrMap[s._ouder];
          if(ouder && ouder._nr !== s._nr){
            // Geldig: ouder bestaat en is niet de stap zelf
            ouder.substappen.push(s);
          } else if(ouder && ouder._nr === s._nr){
            // Stap verwijst naar zichzelf als ouder
            waarschuwingen.push(`"${s.naam}" (${s._nr}): ouder_stap_nr mag niet gelijk zijn aan stap_nr. Als N2-substap gebruik bijv. ${s._nr}.01`);
            wortel.push(s);
          } else {
            // Ouder niet gevonden
            waarschuwingen.push(`"${s.naam}" (${s._nr}): ouder "${s._ouder}" niet gevonden in dit bestand. Als N1-stap: laat ouder_stap_nr leeg.`);
            wortel.push(s);
          }
        }
      });
      const cleanup=st=>{delete st._nr;delete st._ouder;st.substappen.forEach(cleanup);};wortel.forEach(cleanup);
      res[pid]={naam:pd.naam,stappen:wortel};
    }
    csvBuf=res;
    const regeltjes=Object.entries(res).map(([pid,pd])=>{
      const tot=telSt(pd.stappen);
      const sub=pd.stappen.reduce((t,s)=>t+telSt(s.substappen||[]),0);
      return `<strong>${pd.naam}</strong> (${pid}): ${pd.stappen.length} N1-stappen, ${sub} substappen`;
    });
    let html=regeltjes.join('<br>');
    if(waarschuwingen.length){
      html+=`<div style="margin-top:10px;padding:8px 10px;background:#fff3cd;border-radius:4px;border-left:3px solid #f0a500;font-size:11px;color:#856404">
        <strong>Waarschuwingen (${waarschuwingen.length}):</strong><br>${waarschuwingen.map(w=>'&#9888; '+w).join('<br>')}
        <br><br><em>Tip: N2-substappen krijgen stap_nr zoals PM-B02.01, PM-B02.02 en ouder_stap_nr = PM-B02</em>
      </div>`;
    }
    prev.innerHTML=html;prev.style.display='';
  }catch(err2){err.textContent='Fout: '+err2.message;err.style.display='';}
}
function bouwIOcsv(cellen,idx,r){
  const res=[];
  for(let n=1;n<=3;n++){
    const lk=r+'_'+n,bk=r+'_'+n+(r==='input'?'_bron':'_doel'),v=r==='input'?'bron':'doel';
    const lbl=(cellen[idx(lk)]||'').trim(),bron=(cellen[idx(bk)]||'').trim()||'intern';
    if(lbl)res.push({label:lbl,[v]:bron});
  }
  return res;
}
function csvParsRegel(regel){
  const cellen=[];let cel='';let inQ=false;
  for(let i=0;i<regel.length;i++){const c=regel[i];if(inQ){if(c==='"'&&regel[i+1]==='"'){cel+='"';i++;}else if(c==='"'){inQ=false;}else{cel+=c;}}else{if(c==='"'){inQ=true;}else if(c===';'){cellen.push(cel);cel='';}else{cel+=c;}}}
  cellen.push(cel);return cellen;
}
function telSt(stappen){return stappen.reduce((t,s)=>t+1+telSt(s.substappen||[]),0);}
function csvImport(){
  if(!csvBuf){notif('Laad eerst een CSV','fout');return;}
  let bij=0,nieuw=0;
  for(const [pid,pd] of Object.entries(csvBuf)){
    const bestaand=proc(pid);
    if(bestaand){samenvoeg(bestaand.stappen,pd.stappen);bij++;}
    else{S.data.processen.push({id:pid,naam:pd.naam,categorie:(S.data.clusters||[{}])[0]?.id||'pm',niveau:2,volgorde:1,eigenaar:'',beschrijving:'',status:'concept',versie:'0.1',aangepast:td(),stappen:pd.stappen});nieuw++;}
  }
  sluit('mcsv');laadUI();markeer();if(S.hid)teken();notif('Geimporteerd: '+bij+' bijgewerkt, '+nieuw+' nieuw','ok');
}
function samenvoeg(bestaand,nieuw){
  nieuw.forEach(ns=>{
    const m=bestaand.find(bs=>bs.id===ns.id||bs.naam.toLowerCase()===ns.naam.toLowerCase());
    if(m){
      // Bewaar bestaande substappen
      const bestaandeSub=m.substappen||[];
      // Kopieer nieuwe velden (behalve substappen)
      const {substappen:nieuweSub,...rest}=ns;
      Object.assign(m,rest);
      // Samenvoegen substappen recursief
      if((nieuweSub||[]).length){
        samenvoeg(bestaandeSub,nieuweSub);
      }
      m.substappen=bestaandeSub;
    } else {
      bestaand.push(ns);
    }
  });
}


// ══════════════════════════════════════════════
// INFORMATIEBEHOEFTE MODULE
// ══════════════════════════════════════════════

const IB_CATS = {
  bijhoudt:    { label: 'Bijhoudt',     kleur: '#4caf50', bg: '#e8f5e9', tekst: '#2e7d32', icoon: '&#128193;' },
  produceert:  { label: 'Produceert',   kleur: '#2196f3', bg: '#e3f2fd', tekst: '#1565c0', icoon: '&#128228;' },
  uitgangspunt:{ label: 'Uitgangspunt', kleur: '#ff9800', bg: '#fff8e1', tekst: '#e65100', icoon: '&#128229;' }
};

let ibHuidigItemId = null;

// ── IB SCHERM TONEN ──
function toonIB(){
  const p = proc(S.hid); if(!p) return;
  document.getElementById('canvas').style.display = 'none';
  document.getElementById('ea-canvas').style.display = 'none';
  document.getElementById('sp').classList.remove('open');
  document.getElementById('ib-canvas').style.display = 'flex';
  document.getElementById('vt').style.display = 'none';
  document.getElementById('bst').style.display = 'none';
  document.getElementById('bib').style.background = 'var(--gg)';
  document.getElementById('bib').style.color = 'white';
  document.getElementById('bea').style.background = '';
  document.getElementById('bea').style.color = '';
  tekenIB(p);
}

function sluitIB(){
  document.getElementById('canvas').style.display = '';
  document.getElementById('ib-canvas').style.display = 'none';
  document.getElementById('vt').style.display = 'flex';
  document.getElementById('bst').style.display = '';
  document.getElementById('bib').style.background = '';
  document.getElementById('bib').style.color = '';
}

// ── IB SCHERM OPBOUWEN ──
function tekenIB(p){
  const ibc = document.getElementById('ib-canvas');
  const ib = p.informatiebehoefte || { gesproken_met:'', datum:'', status:'concept', items:[] };
  const nr = procNr(p);

  // Sessie-balk
  let h = `<div class="ib-hdr">
    <div>
      <div style="font-family:var(--m);font-size:11px;font-weight:700;color:var(--ga);margin-bottom:2px">${nr}</div>
      <h2>${p.naam} — Informatiebehoefte</h2>
    </div>
    <div style="display:flex;gap:8px;margin-left:auto">
      <button class="btn bg" onclick="ibCSVTemplate()">&#128229; CSV-template</button>
      <button class="btn bg" onclick="ibCSVImport()">&#128228; CSV importeren</button>
      <button class="btn bp" onclick="ibItemModal()">+ Item toevoegen</button>
      <button class="btn bg" onclick="sluitIB()">&#8592; Terug naar schema</button>
    </div>
  </div>`;

  // Sessie-info
  h += `<div class="ib-sess">
    <div style="display:flex;flex-direction:column;gap:3px">
      <label>Gesproken met</label>
      <input id="ib-met" value="${ib.gesproken_met||''}" placeholder="Naam deskundige" onchange="ibSessieOpslaan()" style="width:200px">
    </div>
    <div style="display:flex;flex-direction:column;gap:3px">
      <label>Datum gesprek</label>
      <input id="ib-datum" type="date" value="${ib.datum||''}" onchange="ibSessieOpslaan()" style="width:160px">
    </div>
    <div style="display:flex;flex-direction:column;gap:3px">
      <label>Status</label>
      <select id="ib-status" onchange="ibSessieOpslaan()" style="padding:5px 8px;border:1.5px solid var(--g1);border-radius:var(--r);font-family:var(--f);font-size:12px;outline:none">
        <option value="concept" ${(ib.status||'concept')==='concept'?'selected':''}>Concept</option>
        <option value="review" ${ib.status==='review'?'selected':''}>In review</option>
        <option value="definitief" ${ib.status==='definitief'?'selected':''}>Definitief</option>
      </select>
    </div>
    <div style="font-size:12px;color:var(--gs);margin-left:auto">
      ${(ib.items||[]).length} item${(ib.items||[]).length!==1?'s':''}
    </div>
  </div>`;

  // Drie kolommen per categorie
  h += '<div class="ib-cats">';
  ['bijhoudt','produceert','uitgangspunt'].forEach(cat => {
    const cfg = IB_CATS[cat];
    const items = (ib.items||[]).filter(i => i.categorie === cat);
    h += `<div class="ib-cat">
      <div class="ib-cat-hdr ${cat}" style="background:${cfg.bg};color:${cfg.tekst}">
        <span>${cfg.icoon} ${cfg.label}</span>
        <button onclick="ibItemModal('',event,'${cat}')" style="background:rgba(0,0,0,.1);border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:${cfg.tekst}">+</button>
      </div>
      <div class="ib-cat-body">`;

    if(!items.length){
      h += `<div class="ib-leeg">Nog geen items.<br>Klik + om toe te voegen.</div>`;
    } else {
      items.forEach(item => {
        const routes = ibRouteLabel(item, cat);
        h += `<div class="ib-item ${cat}" onclick="ibItemModal('${item.id}',event,'${cat}')">
          <div class="ib-item-nm">${item.naam}</div>
          ${item.omschrijving?`<div class="ib-item-oms">${item.omschrijving}</div>`:''}
          ${(item.velden||[]).length?`<div class="ib-item-velden">${item.velden.map(v=>`<span class="ib-veld">${v}</span>`).join('')}</div>`:''}
          ${routes?`<div class="ib-item-route">${routes}</div>`:''}
        </div>`;
      });
    }
    h += '</div></div>';
  });
  h += '</div>';

  ibc.innerHTML = h;
}

function ibRouteLabel(item, cat){
  const processen = S.data?.processen || [];
  if(cat === 'uitgangspunt'){
    const bronnen = [].concat(item.herkomst||[]).filter(h=>h&&h!=='intern');
    if(!bronnen.length) return cat==='uitgangspunt'?'<span>&#8592; intern</span>':'';
    return '&#8592; ' + bronnen.map(id=>{ const p=proc(id); return p?`<strong>${procNr(p)}</strong>`:id; }).join(', ');
  } else {
    const bestemmingen = [].concat(item.bestemming||[]).filter(b=>b&&b!=='intern');
    if(!bestemmingen.length) return '';
    return '&#8594; ' + bestemmingen.map(id=>{ const p=proc(id); return p?`<strong>${procNr(p)}</strong>`:id; }).join(', ');
  }
}

// ── SESSIE OPSLAAN ──
function ibSessieOpslaan(){
  const p = proc(S.hid); if(!p) return;
  if(!p.informatiebehoefte) p.informatiebehoefte = { items:[] };
  p.informatiebehoefte.gesproken_met = document.getElementById('ib-met')?.value || '';
  p.informatiebehoefte.datum = document.getElementById('ib-datum')?.value || '';
  p.informatiebehoefte.status = document.getElementById('ib-status')?.value || 'concept';
  markeer();
}

// ── ITEM MODAL ──
function ibItemModal(itemId, evt, catVoorinstelling){
  if(evt) evt.stopPropagation();
  ibHuidigItemId = itemId || null;
  const p = proc(S.hid); if(!p) return;
  const ib = p.informatiebehoefte || { items:[] };
  const item = itemId ? (ib.items||[]).find(i=>i.id===itemId) : null;

  document.getElementById('mib-t').textContent = item ? 'Item bewerken' : 'Informatie-item toevoegen';
  document.getElementById('bib-del').style.display = item ? '' : 'none';
  document.getElementById('ib-nm').value = item?.naam || '';
  document.getElementById('ib-cat').value = item?.categorie || catVoorinstelling || 'bijhoudt';
  document.getElementById('ib-oms').value = item?.omschrijving || '';

  // Vul proces-selectie
  const procSel = document.getElementById('ib-proc');
  const andereProc = (S.data?.processen||[]).filter(x=>x.id!==S.hid);
  procSel.innerHTML = '<option value="intern">Intern (dit proces)</option>' +
    andereProc.map(x=>`<option value="${x.id}">${procNr(x)} ${x.naam}</option>`).join('');

  // Herstel selectie
  const geselecteerd = [].concat(item?.herkomst||item?.bestemming||[]);
  Array.from(procSel.options).forEach(o => o.selected = geselecteerd.includes(o.value));

  // Velden
  const veldDiv = document.getElementById('ib-velden-lijst');
  veldDiv.innerHTML = '';
  (item?.velden||[]).forEach(v => ibVeldRijMaak(v));

  document.getElementById('mib').style.display = 'flex';
}

function ibVeldToe(){ ibVeldRijMaak(''); }

function ibVeldRijMaak(waarde){
  const div = document.createElement('div');
  div.className = 'ib-veld-rij';
  div.innerHTML = `<input class="ib-veld-inp" placeholder="bijv. bevoegd gezag" value="${waarde}">
    <button class="iorm" onclick="this.parentElement.remove()">x</button>`;
  document.getElementById('ib-velden-lijst').appendChild(div);
  if(!waarde) div.querySelector('input').focus();
}

function ibItemSla(){
  const naam = document.getElementById('ib-nm').value.trim();
  if(!naam){ notif('Vul een naam in', 'fout'); return; }
  const p = proc(S.hid); if(!p) return;
  if(!p.informatiebehoefte) p.informatiebehoefte = { gesproken_met:'', datum:'', status:'concept', items:[] };

  const cat = document.getElementById('ib-cat').value;
  const procSel = document.getElementById('ib-proc');
  const geselecteerd = Array.from(procSel.selectedOptions).map(o=>o.value);
  const velden = Array.from(document.querySelectorAll('.ib-veld-inp'))
    .map(i=>i.value.trim()).filter(Boolean);

  const veld = cat === 'uitgangspunt' ? 'herkomst' : 'bestemming';
  const itemData = {
    id: ibHuidigItemId || gid('ib'),
    naam,
    categorie: cat,
    omschrijving: document.getElementById('ib-oms').value.trim(),
    velden,
    [veld]: geselecteerd
  };

  if(ibHuidigItemId){
    const idx = p.informatiebehoefte.items.findIndex(i=>i.id===ibHuidigItemId);
    if(idx>=0) p.informatiebehoefte.items[idx] = itemData;
    else p.informatiebehoefte.items.push(itemData);
  } else {
    p.informatiebehoefte.items.push(itemData);
  }

  sluit('mib');
  markeer();
  tekenIB(p);
  notif('"'+naam+'" opgeslagen', 'ok');
}

function ibItemDel(){
  if(!confirm('Item verwijderen?')) return;
  const p = proc(S.hid); if(!p) return;
  p.informatiebehoefte.items = (p.informatiebehoefte.items||[]).filter(i=>i.id!==ibHuidigItemId);
  sluit('mib');
  markeer();
  tekenIB(p);
  notif('Item verwijderd', 'ok');
}

// ── CSV TEMPLATE ──
function ibCSVTemplate(){
  const p = proc(S.hid); if(!p) return;
  const nr = procNr(p);
  const andereProc = (S.data?.processen||[]).filter(x=>x.id!==S.hid);
  const procOpties = andereProc.map(x=>procNr(x)+' ('+x.naam+')').join(' | ');

  const metaRegels = [];
  metaRegels.push('# IPP Procesmanager - Informatiebehoefte template');
  metaRegels.push('# Proces: '+p.naam+' ('+p.id+')');
  metaRegels.push('# Procesnummer: '+nr);
  metaRegels.push('# Aangemaakt: '+td());
  metaRegels.push('# ');
  metaRegels.push('# INSTRUCTIE: Vul per informatie-item een rij in.');
  metaRegels.push('# Laat kolommen leeg als niet bekend - alles mag ruw zijn.');
  metaRegels.push('# ');
  metaRegels.push('# CATEGORIE: bijhoudt | produceert | uitgangspunt');
  metaRegels.push('# HERKOMST_BESTEMMING: intern | '+andereProc.map(x=>x.id).join(' | '));
  metaRegels.push('# ('+procOpties+')');
  metaRegels.push('# ');
  const meta = metaRegels.join('\n');

  const header = 'naam;categorie;omschrijving;veld_1;veld_2;veld_3;veld_4;veld_5;herkomst_bestemming_1;herkomst_bestemming_2';
  const bestaand = (p.informatiebehoefte?.items||[]).map(item => {
    const veld = item.categorie==='uitgangspunt'?'herkomst':'bestemming';
    const routes = [].concat(item[veld]||[]);
    const velden = item.velden||[];
    return [item.naam,item.categorie,item.omschrijving||'',
      velden[0]||'',velden[1]||'',velden[2]||'',velden[3]||'',velden[4]||'',
      routes[0]||'',routes[1]||''
    ].map(v=>csvEsc(String(v))).join(';');
  }).join('\n');
  const voorbeelden = [
    p.naam+' register;bijhoudt;Overzicht van alle items met status;naam;status;datum;verantwoordelijke;;intern;',
    'Rapportage;produceert;Periodieke rapportage;periode;status;;;;intern;pm_planning',
    'Projectplanning;uitgangspunt;Planning als kader;mijlpalen;deadlines;;;;pm_planning;'
  ].join('\n');
  const inhoud = meta+'\n'+header+'\n'+(bestaand||voorbeelden)+'\n';
  const blob = new Blob([inhoud],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = p.id+'_informatiebehoefte.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  notif('CSV-template gedownload','ok');
}

function ibCSVImport(){
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='.csv,.txt';
  inp.onchange = e => {
    const f=e.target.files[0]; if(!f)return;
    const r=new FileReader();
    r.onload=ev=>ibVerwerkCSV(ev.target.result);
    r.readAsText(f,'UTF-8');
  };
  inp.click();
}

function ibVerwerkCSV(tekst){
  const p=proc(S.hid); if(!p)return;
  if(!p.informatiebehoefte) p.informatiebehoefte={gesproken_met:'',datum:'',status:'concept',items:[]};
  const regels=tekst.split('\n').map(r=>r.trimEnd()).filter(r=>r.trim()&&!r.startsWith('#'));
  if(regels.length<2){notif('Geen data in CSV','fout');return;}
  const kols=regels[0].split(';').map(k=>k.trim().toLowerCase());
  const idx=k=>kols.indexOf(k);
  let toegevoegd=0,bijgewerkt=0;
  regels.slice(1).forEach(regel=>{
    const cellen=csvParsRegel(regel);
    const get=k=>(cellen[idx(k)]||'').trim();
    const naam=get('naam'); if(!naam)return;
    const cat=get('categorie')||'bijhoudt';
    const veld=cat==='uitgangspunt'?'herkomst':'bestemming';
    const routes=[];
    for(let n=1;n<=2;n++){const v=get('herkomst_bestemming_'+n);if(v)routes.push(v);}
    const velden=[];
    for(let n=1;n<=5;n++){const v=get('veld_'+n);if(v)velden.push(v);}
    const itemData={id:gid('ib'),naam,categorie:cat,omschrijving:get('omschrijving'),velden,[veld]:routes.length?routes:['intern']};
    const bestaand=p.informatiebehoefte.items.find(i=>i.naam.toLowerCase()===naam.toLowerCase());
    if(bestaand){Object.assign(bestaand,itemData);bestaand.id=bestaand.id;bijgewerkt++;}
    else{p.informatiebehoefte.items.push(itemData);toegevoegd++;}
  });
  markeer();
  tekenIB(p);
  notif('Geimporteerd: '+toegevoegd+' nieuw, '+bijgewerkt+' bijgewerkt','ok');
}


// ══════════════════════════════════════════════
// ELEMENTEN & ATTRIBUTEN MODULE
// ══════════════════════════════════════════════

function toonEA(){
  const p = proc(S.hid); if(!p) return;
  document.getElementById('canvas').style.display = 'none';
  document.getElementById('ib-canvas').style.display = 'none';
  document.getElementById('sp').classList.remove('open');
  document.getElementById('ea-canvas').style.display = 'flex';
  document.getElementById('vt').style.display = 'none';
  document.getElementById('bst').style.display = 'none';
  document.getElementById('bib').style.background = '';
  document.getElementById('bib').style.color = '';
  document.getElementById('bea').style.background = 'var(--gg)';
  document.getElementById('bea').style.color = 'white';
  S.eaMode='ist';S.eaGekozen=null;
  document.getElementById('ea-canvas').classList.remove('soll-mode');
  document.getElementById('ea-canvas').scrollTop=0;
  tekenEA(p);
}

function sluitEA(){
  document.getElementById('canvas').style.display = '';
  document.getElementById('ea-canvas').style.display = 'none';
  document.getElementById('vt').style.display = 'flex';
  document.getElementById('bst').style.display = '';
  document.getElementById('bea').style.background = '';
  document.getElementById('bea').style.color = '';
}

function alleStappenFlat(stappen){
  const res = [];
  (stappen||[]).forEach(s=>{
    res.push(s);
    res.push(...alleStappenFlat(s.substappen||[]));
  });
  return res;
}

function verzamelElementen(p){
  const stappen = alleStappenFlat(p.stappen||[]);
  const map = {};
  stappen.forEach(s=>{
    (s.input||[]).forEach(io=>{
      if(!io.label?.trim()) return;
      const key = io.label.trim().toLowerCase();
      if(!map[key]) map[key]={label:io.label.trim(),ins:[],outs:[],attrs:[]};
      map[key].ins.push(s);
      (io.attributen||[]).forEach(a=>{ if(a&&!map[key].attrs.includes(a)) map[key].attrs.push(a); });
    });
    (s.output||[]).forEach(io=>{
      if(!io.label?.trim()) return;
      const key = io.label.trim().toLowerCase();
      if(!map[key]) map[key]={label:io.label.trim(),ins:[],outs:[],attrs:[]};
      map[key].outs.push(s);
      (io.attributen||[]).forEach(a=>{ if(a&&!map[key].attrs.includes(a)) map[key].attrs.push(a); });
    });
  });
  return Object.values(map);
}

function eaSuggesties(labelKey, excludeIds){
  excludeIds = excludeIds || [S.hid];
  const attrs = new Set();
  (S.data.processen||[]).filter(p=>!excludeIds.includes(p.id)).forEach(p=>{
    alleStappenFlat(p.stappen||[]).forEach(s=>{
      [...(s.input||[]),...(s.output||[])].forEach(io=>{
        if(io.label?.trim().toLowerCase()===labelKey){
          (io.attributen||[]).forEach(a=>attrs.add(a));
        }
      });
    });
  });
  return [...attrs];
}

function eaModeHeader(){
  return `<div class="ea-toggle">
    <button class="eatb ${S.eaMode!=='soll'?'a':''}" onclick="eaSetModeIst()">IST &mdash; huidige situatie</button>
    <button class="eatb ${S.eaMode==='soll'?'a':''}" onclick="eaOpenSollPicker()">SOLL &mdash; EA matchen</button>
  </div>`;
}
function eaSetModeIst(){
  S.eaMode='ist';S.eaGekozen=null;
  document.getElementById('ea-canvas').classList.remove('soll-mode');
  tekenEA(proc(S.hid));
}
function eaActieveProcessen(){
  return S.eaMode==='soll' ? (S.eaSollProcs||[]) : [S.hid];
}
function eaRedraw(){
  if(S.eaMode==='soll') tekenEASoll();
  else tekenEA(proc(S.hid));
}

function tekenEA(p){
  const eac = document.getElementById('ea-canvas');
  eac.classList.remove('soll-mode');
  const elementen = verzamelElementen(p);
  const nr = procNr(p);

  let h = `<div class="ea-hdr">
    <div>
      <div style="font-family:var(--m);font-size:11px;font-weight:700;color:var(--ga);margin-bottom:2px">${nr}</div>
      <h2>${p.naam} &#8212; Elementen &amp; Attributen</h2>
    </div>
    <div style="display:flex;gap:8px;margin-left:auto;align-items:center">
      ${eaModeHeader()}
      <button class="btn bg" onclick="sluitEA()">&#8592; Terug naar schema</button>
    </div>
  </div>`;

  if(!elementen.length){
    h += '<div class="leeg"><div class="li">&#128197;</div><h3>Geen elementen gevonden</h3><p>Voeg input en output toe aan de processtappen.</p></div>';
    eac.innerHTML = h;
    return;
  }

  h += `<p style="font-size:12px;color:var(--gs);margin-bottom:16px">${elementen.length} element${elementen.length!==1?'en':''} gevonden in de stappen van dit proces. Klik + om attributen toe te voegen.</p>`;

  elementen.sort((a,b)=>a.label.localeCompare(b.label)).forEach(el=>{
    const key = el.label.toLowerCase();
    const richting = el.ins.length && el.outs.length ? 'inout' : el.ins.length ? 'in' : 'out';
    const richtingLabel = richting==='inout'?'In + Out':richting==='in'?'Input':'Output';
    const stapNamen = [...new Set([...el.ins.map(s=>s.naam),...el.outs.map(s=>s.naam)])];
    const suggesties = eaSuggesties(key).filter(s=>!el.attrs.includes(s));
    const safeKey = encodeURIComponent(key).replace(/%/g,'_');

    h += `<div class="ea-item">
      <div class="ea-item-hdr">
        <div class="ea-item-nm">${el.label}</div>
        <span class="ea-badge ${richting}">${richtingLabel}</span>
      </div>
      <div class="ea-stap-info">Stap${stapNamen.length!==1?'pen':''}: ${stapNamen.join(', ')}</div>
      <div class="ea-attrs" id="ea-attrs-${safeKey}">`;

    if(!el.attrs.length){
      h += `<span class="ea-leeg">Nog geen attributen toegevoegd.</span>`;
    } else {
      el.attrs.forEach(attr=>{
        const safeAttr = attr.replace(/'/g,'&apos;').replace(/"/g,'&quot;');
        h += `<span class="ea-attr">${attr} <button class="ea-attr-del" title="Verwijder" onclick="eaDelAttr('${safeKey}','${el.label.replace(/'/g,'&apos;')}','${safeAttr}')">x</button></span>`;
      });
    }

    h += `</div>
      <div class="ea-add">
        <input id="ea-inp-${safeKey}" placeholder="Nieuw attribuut toevoegen..." onkeydown="if(event.key==='Enter')eaVoegToe('${safeKey}','${el.label.replace(/'/g,'&apos;')}')">
        <button class="btn bp" style="font-size:11px;padding:3px 10px" onclick="eaVoegToe('${safeKey}','${el.label.replace(/'/g,'&apos;')}')">+</button>
      </div>`;

    if(suggesties.length){
      h += `<div class="ea-suggesties"><div class="ea-sug-titel">Suggesties uit andere processen (klik om over te nemen):</div>`;
      suggesties.forEach(s=>{
        const safeS = s.replace(/'/g,'&apos;');
        h += `<span class="ea-attr ea-attr-sug" onclick="eaVoegSugToe('${safeKey}','${el.label.replace(/'/g,'&apos;')}','${safeS}')">${s} +</span> `;
      });
      h += `</div>`;
    }

    h += `</div>`;
  });

  eac.innerHTML = h;
}

function eaVoegToe(safeKey, label){
  const inp = document.getElementById('ea-inp-'+safeKey);
  const val = inp?.value.trim();
  if(!val){ notif('Vul een attribuutnaam in','fout'); return; }
  eaSchrijfAttrIn(eaActieveProcessen(), label, val);
  eaRedraw();
  notif('"'+val+'" toegevoegd','ok');
}

function eaVoegSugToe(safeKey, label, attr){
  eaSchrijfAttrIn(eaActieveProcessen(), label, attr);
  eaRedraw();
  notif('"'+attr+'" overgenomen','ok');
}

function eaDelAttr(safeKey, label, attr){
  eaVerwijderAttrIn(eaActieveProcessen(), label, attr);
  eaRedraw();
  notif('"'+attr+'" verwijderd','ok');
}

function eaSchrijfAttrIn(processIds, label, attr){
  const key = label.toLowerCase();
  processIds.forEach(pid=>{
    const p = proc(pid); if(!p) return;
    alleStappenFlat(p.stappen||[]).forEach(s=>{
      [...(s.input||[]),...(s.output||[])].forEach(io=>{
        if(io.label?.trim().toLowerCase()===key){
          if(!io.attributen) io.attributen = [];
          if(!io.attributen.includes(attr)) io.attributen.push(attr);
        }
      });
    });
  });
  markeer();
}

function eaVerwijderAttrIn(processIds, label, attr){
  const key = label.toLowerCase();
  processIds.forEach(pid=>{
    const p = proc(pid); if(!p) return;
    alleStappenFlat(p.stappen||[]).forEach(s=>{
      [...(s.input||[]),...(s.output||[])].forEach(io=>{
        if(io.label?.trim().toLowerCase()===key && io.attributen){
          io.attributen = io.attributen.filter(a=>a!==attr);
        }
      });
    });
  });
  markeer();
}

// ══════════════════════════════════════════════
// EA SOLL — EA MATCHEN (BRAINSTORM-WERKSCHERM)
// ══════════════════════════════════════════════

function eaOpenSollPicker(){
  const lijst = document.getElementById('meap-lijst');
  const huidige = new Set(S.eaSollProcs && S.eaSollProcs.length ? S.eaSollProcs : (S.hid?[S.hid]:[]));
  const procsSorted = [...(S.data.processen||[])].sort((a,b)=>procNr(a).localeCompare(procNr(b)));
  lijst.innerHTML = procsSorted.map(p=>`
    <label class="meap-rij">
      <input type="checkbox" value="${p.id}" ${huidige.has(p.id)?'checked':''}>
      <span class="meap-nr">${procNr(p)}</span>
      <span class="meap-nm">${p.naam}</span>
    </label>`).join('');
  document.getElementById('meap').style.display = 'flex';
}
function eapAlles(){document.querySelectorAll('#meap-lijst input[type=checkbox]').forEach(c=>c.checked=true);}
function eapNiets(){document.querySelectorAll('#meap-lijst input[type=checkbox]').forEach(c=>c.checked=false);}
function eapAlleenHuidig(){document.querySelectorAll('#meap-lijst input[type=checkbox]').forEach(c=>c.checked=(c.value===S.hid));}
function eapStart(){
  const ids = [...document.querySelectorAll('#meap-lijst input[type=checkbox]:checked')].map(c=>c.value);
  if(!ids.length){ notif('Kies minimaal 1 proces','fout'); return; }
  S.eaSollProcs = ids; S.eaMode = 'soll'; S.eaGekozen = null;
  sluit('meap');
  document.getElementById('ea-canvas').classList.add('soll-mode');
  tekenEASoll();
}

function verzamelElementenMulti(processIds){
  const map = {};
  processIds.forEach(pid=>{
    const p = proc(pid); if(!p) return;
    alleStappenFlat(p.stappen||[]).forEach(s=>{
      (s.input||[]).forEach(io=>{
        if(!io.label?.trim()) return;
        const key = io.label.trim().toLowerCase();
        if(!map[key]) map[key]={label:io.label.trim(),refs:[],attrs:[]};
        map[key].refs.push({proc:p,stap:s});
        (io.attributen||[]).forEach(a=>{ if(a&&!map[key].attrs.includes(a)) map[key].attrs.push(a); });
      });
      (s.output||[]).forEach(io=>{
        if(!io.label?.trim()) return;
        const key = io.label.trim().toLowerCase();
        if(!map[key]) map[key]={label:io.label.trim(),refs:[],attrs:[]};
        map[key].refs.push({proc:p,stap:s});
        (io.attributen||[]).forEach(a=>{ if(a&&!map[key].attrs.includes(a)) map[key].attrs.push(a); });
      });
    });
  });
  return map;
}

function eaPak(safeKey, label){
  S.eaGekozen = {key:label.toLowerCase(), label:label};
  eaRedraw();
}
function eaAnnuleerKeuze(){
  S.eaGekozen = null;
  eaRedraw();
}
function eaMaakLink(type, safeKeyB, labelB){
  if(!S.eaGekozen){ notif('Kies eerst een kaart om te koppelen','fout'); return; }
  const keyB = labelB.toLowerCase();
  if(S.eaGekozen.key===keyB){ notif('Kies een andere kaart om mee te koppelen','fout'); return; }
  let toelichting = '';
  if(type==='koppeling'){
    const t = prompt('Toelichting bij deze koppeling (optioneel):','');
    if(t===null) return;
    toelichting = t.trim();
  }
  const bestaat = (S.data.eaLinks||[]).some(l=>l.type===type && ((l.vanKey===S.eaGekozen.key&&l.naarKey===keyB)||(l.vanKey===keyB&&l.naarKey===S.eaGekozen.key)));
  if(bestaat){ notif('Deze koppeling bestaat al','fout'); return; }
  if(!S.data.eaLinks) S.data.eaLinks=[];
  S.data.eaLinks.push({id:gid('eal'),type,vanKey:S.eaGekozen.key,vanLabel:S.eaGekozen.label,naarKey:keyB,naarLabel:labelB,toelichting,datum:td()});
  notif(type==='zelfde'?'Gekoppeld als zelfde info':'Koppeling vastgelegd','ok');
  S.eaGekozen = null;
  markeer();
  eaRedraw();
}
function eaVerwijderLink(id){
  S.data.eaLinks = (S.data.eaLinks||[]).filter(l=>l.id!==id);
  markeer();
  eaRedraw();
  notif('Koppeling verwijderd','ok');
}
function eaVerwijderGroep(idsCsv){
  const ids = idsCsv.split(',');
  S.data.eaLinks = (S.data.eaLinks||[]).filter(l=>!ids.includes(l.id));
  markeer();
  eaRedraw();
  notif('Groep ontkoppeld','ok');
}
// Vat "zelfde info"-links transitief samen tot groepen (union-find): A=B en B=C wordt 1 groep {A,B,C}.
function eaZelfdeGroepen(){
  const links = (S.data.eaLinks||[]).filter(l=>l.type==='zelfde');
  const parent = {}, labelOf = {};
  const find = x=>{ while(parent[x]!==x) x = parent[x] = parent[parent[x]]; return x; };
  links.forEach(l=>{
    if(!(l.vanKey in parent)) parent[l.vanKey]=l.vanKey;
    if(!(l.naarKey in parent)) parent[l.naarKey]=l.naarKey;
    labelOf[l.vanKey]=l.vanLabel; labelOf[l.naarKey]=l.naarLabel;
    const ra=find(l.vanKey), rb=find(l.naarKey);
    if(ra!==rb) parent[ra]=rb;
  });
  const groepen = {};
  Object.keys(parent).forEach(k=>{
    const r = find(k);
    (groepen[r] = groepen[r]||[]).push(k);
  });
  return Object.values(groepen).map(keys=>({
    keys, labels: keys.map(k=>labelOf[k]),
    linkIds: links.filter(l=>keys.includes(l.vanKey)&&keys.includes(l.naarKey)).map(l=>l.id)
  }));
}
function renderEALinksLijst(){
  const links = S.data.eaLinks||[];
  if(!links.length) return '<div class="ea-leeg">Nog geen SOLL-koppelingen vastgelegd.</div>';
  let h = '';
  eaZelfdeGroepen().forEach(g=>{
    h += `<div class="ea-link-rij ea-link-rij-groep">
      <span class="ea-link-type zelfde">Zelfde info</span>
      <span class="ea-link-groep-leden">${g.labels.map(l=>`<span>${l}</span>`).join('<span class="ea-link-eq">=</span>')}</span>
      <button class="ea-link-del" onclick="eaVerwijderGroep('${g.linkIds.join(',')}')" title="Verwijder groep">x</button>
    </div>`;
  });
  links.filter(l=>l.type==='koppeling').forEach(l=>{
    h += `<div class="ea-link-rij">
      <span class="ea-link-type koppeling">Koppeling</span>
      <span class="ea-link-van">${l.vanLabel}</span>
      <span class="ea-link-pijl">&#8594;</span>
      <span class="ea-link-naar">${l.naarLabel}</span>
      ${l.toelichting?`<span class="ea-link-toel">&quot;${l.toelichting}&quot;</span>`:''}
      <button class="ea-link-del" onclick="eaVerwijderLink('${l.id}')" title="Verwijder">x</button>
    </div>`;
  });
  return h;
}

function renderEAKaart(el, scheiding){
  const key = el.key;
  const safeKey = encodeURIComponent(key).replace(/%/g,'_');
  const procNamen = [...new Set(el.refs.map(r=>r.proc.naam))];
  const suggesties = eaSuggesties(key, S.eaSollProcs||[]).filter(s=>!el.attrs.includes(s));
  const isGekozen = S.eaGekozen && S.eaGekozen.key===key;
  const safeLabel = el.label.replace(/'/g,'&apos;');

  let h = `<div class="ea-kaart ${isGekozen?'gekozen':''} ${scheiding?'scheiding':''}">
    <div class="ea-kaart-hdr" onclick="eaPak('${safeKey}','${safeLabel}')" title="Klik om als eerste kaart te kiezen">
      <div class="ea-item-nm">${el.label}</div>
    </div>
    <div class="ea-stap-info">Gebruikt in: ${procNamen.join(', ')}</div>
    <div class="ea-attrs" id="ea-attrs-${safeKey}">`;

  if(!el.attrs.length){
    h += `<span class="ea-leeg">Nog geen attributen toegevoegd.</span>`;
  } else {
    el.attrs.forEach(attr=>{
      const safeAttr = attr.replace(/'/g,'&apos;').replace(/"/g,'&quot;');
      h += `<span class="ea-attr">${attr} <button class="ea-attr-del" title="Verwijder" onclick="eaDelAttr('${safeKey}','${safeLabel}','${safeAttr}')">x</button></span>`;
    });
  }

  h += `</div>
    <div class="ea-add">
      <input id="ea-inp-${safeKey}" placeholder="Nieuw attribuut toevoegen..." onkeydown="if(event.key==='Enter')eaVoegToe('${safeKey}','${safeLabel}')">
      <button class="btn bp" style="font-size:11px;padding:3px 10px" onclick="eaVoegToe('${safeKey}','${safeLabel}')">+</button>
    </div>`;

  if(suggesties.length){
    h += `<div class="ea-suggesties"><div class="ea-sug-titel">Suggesties uit andere processen (klik om over te nemen):</div>`;
    suggesties.forEach(s=>{
      const safeS = s.replace(/'/g,'&apos;');
      h += `<span class="ea-attr ea-attr-sug" onclick="eaVoegSugToe('${safeKey}','${safeLabel}','${safeS}')">${s} +</span> `;
    });
    h += `</div>`;
  }

  h += `<div class="ea-koppel-acties">
    <button class="ea-koppel-btn zelfde" onclick="eaMaakLink('zelfde','${safeKey}','${safeLabel}')">Bevat zelfde info als &#8594;</button>
    <button class="ea-koppel-btn koppeling" onclick="eaMaakLink('koppeling','${safeKey}','${safeLabel}')">Moet koppelen aan &#8594;</button>
  </div>`;

  h += `</div>`;
  return h;
}

function tekenEASoll(){
  const eac = document.getElementById('ea-canvas');
  eac.classList.add('soll-mode');
  const ids = S.eaSollProcs||[];
  const procsLabel = ids.map(id=>pnm(id)).join(' · ');
  const elMap = verzamelElementenMulti(ids);
  const elementen = Object.entries(elMap).map(([key,v])=>({key,...v})).sort((a,b)=>a.label.localeCompare(b.label));

  let h = `<div class="ea-hdr">
    <div>
      <div style="font-family:var(--m);font-size:11px;font-weight:700;color:var(--ga2);margin-bottom:2px">SOLL &mdash; BRAINSTORM</div>
      <h2>EA matchen &#8212; ${ids.length} proces${ids.length!==1?'sen':''}</h2>
      <div style="font-size:11px;color:var(--gs);margin-top:2px">${procsLabel}</div>
    </div>
    <div style="display:flex;gap:8px;margin-left:auto;align-items:center">
      ${eaModeHeader()}
      <button class="btn bg" onclick="eaOpenSollPicker()">Processen wijzigen</button>
      <button class="btn bg" onclick="sluitEA()">&#8592; Terug naar schema</button>
    </div>
  </div>`;

  if(S.eaGekozen){
    h += `<div class="ea-gekozen-banner">Gekozen: <strong>${S.eaGekozen.label}</strong> &mdash; klik bij een andere kaart op "Bevat zelfde info als" of "Moet koppelen aan". <button class="btn bg" style="margin-left:8px;padding:2px 9px;font-size:11px" onclick="eaAnnuleerKeuze()">Annuleer</button></div>`;
  }

  if(!elementen.length){
    h += '<div class="leeg"><div class="li">&#128197;</div><h3>Geen elementen gevonden</h3><p>Kies processen met input/output op de stappen.</p></div>';
    eac.innerHTML = h;
    return;
  }

  const elKeys = new Set(elementen.map(e=>e.key));
  const elByKey = {}; elementen.forEach(e=>elByKey[e.key]=e);
  const groepen = eaZelfdeGroepen()
    .map(g=>({...g, leden: g.keys.filter(k=>elKeys.has(k)).map(k=>elByKey[k])}))
    .filter(g=>g.leden.length>1);
  const inGroep = new Set();
  groepen.forEach(g=>g.leden.forEach(el=>inGroep.add(el.key)));

  const groepKleuren = ['#1a3c34','#f0a500','#2563eb','#9333ea','#0d9488','#dc2626'];
  groepen.forEach((g,i)=>{
    const kleur = groepKleuren[i % groepKleuren.length];
    h += `<div class="ea-groep-rij">
      <div class="ea-groep-label" style="background:${kleur}">Zelfde info &middot; ${g.leden.length} kaarten</div>
      <div class="ea-groep-leden" style="border-color:${kleur}">${g.leden.map((el,j)=>renderEAKaart(el, j>0)).join('')}</div>
    </div>`;
  });

  const overig = elementen.filter(e=>!inGroep.has(e.key));
  if(overig.length){
    h += '<div class="ea-bord">' + overig.map(el=>renderEAKaart(el, false)).join('') + '</div>';
  }

  h += `<div class="ea-links-blok"><div class="ea-links-titel">SOLL-koppelingen (${(S.data.eaLinks||[]).length})</div>${renderEALinksLijst()}</div>`;

  eac.innerHTML = h;
}

init();
