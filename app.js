
function refreshDeviceClass(){
  const root=document.documentElement;
  const ua=navigator.userAgent||"";
  const platform=navigator.platform||"";
  const touch=navigator.maxTouchPoints||0;
  const isIPhone=/iPhone|iPod/i.test(ua);
  const isIPad=/iPad/i.test(ua)||(platform==="MacIntel"&&touch>1);
  const isAndroid=/Android/i.test(ua);
  const isAndroidPhone=isAndroid&&/Mobile/i.test(ua);
  const isAndroidTablet=isAndroid&&!/Mobile/i.test(ua);
  let mode="desktop";
  const physicalShortSide=Math.min(screen.width||window.innerWidth,screen.height||window.innerHeight);
  const physicalPhone=touch>0&&physicalShortSide<=600;
  if(isIPhone||isAndroidPhone||physicalPhone) mode="phone";
  else if(isIPad||isAndroidTablet) mode="tablet";
  else {
    const shortSide=Math.min(window.innerWidth,window.innerHeight);
    if(touch>0&&shortSide<=1100) mode="tablet";
    else if(shortSide<=520) mode="phone";
    else if(shortSide<=1100) mode="tablet";
  }
  root.classList.remove("device-phone","device-tablet","device-desktop");
  root.classList.add("device-"+mode);
  root.dataset.device=mode;
}
window.addEventListener("resize",refreshDeviceClass,{passive:true});
window.addEventListener("orientationchange",refreshDeviceClass,{passive:true});
refreshDeviceClass();

const DATA_URL="https://raw.githubusercontent.com/letzbug/franks_magic/ee1deb187cb56360699bb18606d7685de65d9e6c/data/trainings.json";
const SITES_URL="https://raw.githubusercontent.com/letzbug/unipop_go_sites/main/sites.json";

const SUPABASE_URL="https://tbjlwhbwcxdvagjoonwb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_z2AUPoYHLMqxxizwKrjhwQ_tESJhSxp";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

let authProfile=null;
let authSession=null;
let authBootstrapped=false;

let trainings=[], locations={}, sitesData={schemaVersion:3,guides:[],locations:[]}, currentTrainer=null, trainerCourses=[], selectedOccurrence=null, selectedSite=null;
let backStack=[], selectedDate=new Date(), calendarCursor=new Date();

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DAYS=["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const MONTHS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MONTHS_SHORT=["JANV.","FÉVR.","MARS","AVR.","MAI","JUIN","JUIL.","AOÛT","SEPT.","OCT.","NOV.","DÉC."];

function normalizeText(s=""){return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function parseDate(s){if(!s)return null;const p=String(s).split("/");if(p.length!==3)return null;const[d,m,y]=p.map(Number);return new Date(y,m-1,d,12);}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function formatDMY(d){return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;}
function minutesFromDuration(s=""){const t=String(s).toLowerCase();let h=0,m=0,x=t.match(/(\d+)\s*h/);if(x)h=+x[1];x=t.match(/h\s*(\d+)/);if(x)m=+x[1];if(!h){x=t.match(/(\d+)\s*min/);if(x)m=+x[1];}return h*60+m;}
function addMinutes(hhmm,mins){if(!hhmm)return"";const[h,m]=hhmm.split(":").map(Number),t=h*60+m+mins;return`${String(Math.floor(t/60)%24).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;}
function teacherName(e){return `${e.prenom||""} ${e.nom||""}`.trim();}

function editDistance(a,b){
  a=normalizeText(a);b=normalizeText(b);
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const cur=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=cur;}}
  return row[b.length];
}
function allTeacherNames(){
  const map=new Map();
  trainings.forEach(c=>(c.enseignants||[]).forEach(e=>{const n=teacherName(e);if(n)map.set(normalizeText(n),n);}));
  return [...map.values()].sort((a,b)=>a.localeCompare(b,"fr"));
}
function nameScore(q,n){
  const nq=normalizeText(q),nn=normalizeText(n);
  if(!nq)return 999;if(nq===nn)return 0;if(nn.includes(nq)||nq.includes(nn))return 1;
  const bits=n.split(/\s+/);return Math.min(editDistance(nq,nn),...bits.map(x=>editDistance(nq,x)))+2;
}
function teacherMatches(q){
  return allTeacherNames().map(n=>[n,nameScore(q,n)]).filter(x=>x[1]<=Math.max(4,Math.ceil(normalizeText(q).length*.38)+1)).sort((a,b)=>a[1]-b[1]).slice(0,6).map(x=>x[0]);
}
function locationKey(c){const a=c.adresseCours||{};return normalizeText(`${a.nom||""}${a.rueNumero||""}${a.localite||""}`);}
function isRoomConfirmed(name=""){
  const n=normalizeText(name);
  return !!n && !n.includes("aconfirmer") && !n.includes("confirmer") && n!=="salle";
}
function findRoomForCourse(site,c,legacy={}){
  if(!site)return null;
  const wanted=legacy.room||c.salle||c.salleNom||c.room||"";
  if(!isRoomConfirmed(wanted))return null;
  const w=normalizeText(wanted);
  return (site.rooms||[]).find(r=>[r.name,...(r.aliases||[])].map(normalizeText).some(n=>n&&(n===w||n.includes(w)||w.includes(n))))||null;
}
function locationData(c){
  const key=locationKey(c);
  const byCourse=locations.courses?.[normalizeText(c.code||c.reference||c.id||c.coursCode||c.coursId||"")];
  const legacy=byCourse?{...locations._default,...byCourse}:{...locations._default,...(locations.places?.[key]||{})};
  const site=findSiteForCourse(c);
  if(!site)return legacy;
  const room=findRoomForCourse(site,c,legacy);
  return {...legacy,site,room,phone:site.phone||"",access:room?.directions||site.accessInfo||"",photos:[],equipment:room?.equipment||[],room:room?.name||(isRoomConfirmed(legacy.room)?legacy.room:"Salle à confirmer")};
}

async function loadAll(){
  try{
    const [r1,r2,r3]=await Promise.all([
      fetch(DATA_URL,{cache:"no-store"}),
      fetch("data/locations.json?v=15",{cache:"no-store"}),
      fetch(SITES_URL+"?t="+Date.now(),{cache:"no-store"}).catch(()=>null)
    ]);
    if(!r1.ok)throw new Error("trainings.json");
    trainings=await r1.json();
    locations=await r2.json();
    if(r3&&r3.ok){const remote=await r3.json();if(remote&&Array.isArray(remote.locations))sitesData=remote;}
    $("#dataStatus").textContent=`${trainings.length} cours chargés`;
  }catch(err){
    console.error(err);
    $("#dataStatus").textContent="Catalogue indisponible — vérifiez la connexion.";
  }
}

function releaseIOSFocus(){
  const active=document.activeElement;
  if(active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)){
    active.blur();
  }
}

function showScreen(id,push=true){
  releaseIOSFocus();
  const active=$(".screen.active");
  if(push&&active&&active.id!==id)backStack.push(active.id);
  $$(".screen").forEach(s=>s.classList.remove("active"));
  const target=$("#"+id);if(target)target.classList.add("active");
  $$(".global-tabs .tab").forEach(t=>t.classList.toggle("active",t.dataset.go===id));
  window.scrollTo(0,0);
}

$$("[data-back]").forEach(b=>b.addEventListener("click",()=>showScreen(backStack.pop()||"homeScreen",false)));


function selectTrainer(name){
  const exact=allTeacherNames().find(n=>normalizeText(n)===normalizeText(name));
  if(!exact)return false;
  currentTrainer=exact;
  trainerCourses=trainings.filter(c=>(c.enseignants||[]).some(e=>normalizeText(teacherName(e))===normalizeText(exact)));
  return true;
}



function authMessage(msg,type="info"){
  const el=$("#authStatus");
  if(!el)return;
  el.textContent=msg||"";
  el.dataset.type=type;
}
function accountInitials(name=""){
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"UP";
}
function setAuthView(loggedIn){
  $("#authLoggedOut")?.classList.toggle("hidden",loggedIn);
  $("#authLoggedIn")?.classList.toggle("hidden",!loggedIn);
}
function setAccessEnabled(enabled){
  $("#accountCoursesButton").disabled=!enabled;
  $("#accountCalendarButton").disabled=!enabled;
  $("#accountBlocked").classList.toggle("hidden",enabled);
}
async function claimTrainerAccess(){
  try{await sb.rpc("claim_trainer_access");}catch(e){console.warn("claim_trainer_access",e);}
}
async function loadOwnProfile(){
  const user=authSession?.user;
  if(!user)return null;
  await claimTrainerAccess();
  const {data,error}=await sb.from("trainer_access")
    .select("id,email,trainer_name,role,active,deleted_at,auth_user_id")
    .eq("auth_user_id",user.id)
    .is("deleted_at",null)
    .maybeSingle();
  if(error)throw error;
  return data||null;
}
async function applyAuthenticatedSession(session,{openHome=false}={}){
  authSession=session||null;
  if(!session?.user){
    authProfile=null;
    currentTrainer=null;
    trainerCourses=[];
    setAuthView(false);
    setAccessEnabled(false);
    showScreen("loginScreen",false);
    return false;
  }

  setAuthView(true);
  $("#accountEmail").textContent=session.user.email||"";
  $("#accountStatus").textContent="Vérification de votre accès…";

  try{
    authProfile=await loadOwnProfile();
    if(!authProfile){
      currentTrainer=null;trainerCourses=[];
      $("#accountTrainer").textContent="Accès non autorisé";
      $("#accountAvatar").textContent="UP";
      $("#accountStatus").textContent="Cette adresse e-mail n'est pas autorisée pour UniPop Go.";
      setAccessEnabled(false);
      showScreen("loginScreen",false);
      return false;
    }

    const isAdmin=authProfile.role==="admin";
    $("#openAdminButton")?.classList.toggle("hidden",!isAdmin);

    if(authProfile.active!==true || authProfile.deleted_at){
      currentTrainer=null;trainerCourses=[];
      $("#accountTrainer").textContent=isAdmin?"Administrateur":"Accès désactivé";
      $("#accountAvatar").textContent=isAdmin?"AD":"UP";
      $("#accountStatus").textContent="Compte désactivé.";
      setAccessEnabled(false);
      showScreen("loginScreen",false);
      return false;
    }

    if(isAdmin && !authProfile.trainer_name){
      currentTrainer=null;
      trainerCourses=[];
      $("#accountTrainer").textContent="Administrateur UniPop Go";
      $("#accountAvatar").textContent="FG";
      $("#accountStatus").textContent="Accès administrateur actif.";
      $("#accountCoursesButton").disabled=true;
      $("#accountCalendarButton").disabled=true;
      $("#accountBlocked").classList.add("hidden");
      showScreen("loginScreen",false);
      return true;
    }

    $("#accountTrainer").textContent=authProfile.trainer_name||"Formateur";
    $("#accountAvatar").textContent=accountInitials(authProfile.trainer_name||"UP");

    if(!authProfile.trainer_name || !selectTrainer(authProfile.trainer_name)){
      currentTrainer=null;trainerCourses=[];
      $("#accountStatus").textContent="Le formateur lié à ce compte n'existe pas dans le catalogue actuel.";
      setAccessEnabled(false);
      showScreen("loginScreen",false);
      return false;
    }

    setAccessEnabled(true);
    $("#accountStatus").textContent=`${trainerCourses.length} cours liés à votre profil`;
    if(openHome)renderHome();
    return true;
  }catch(err){
    console.error(err);
    currentTrainer=null;trainerCourses=[];
    $("#accountTrainer").textContent="Connexion";
    $("#accountStatus").textContent="Impossible de vérifier votre profil. Réessayez dans un instant.";
    setAccessEnabled(false);
    showScreen("loginScreen",false);
    return false;
  }
}
function validPassword(p){return typeof p==="string"&&p.length>=8;}
async function loginWithPassword(){
  const email=$("#authEmail").value.trim();
  const password=$("#authPassword").value;
  if(!email||!password){authMessage("Entrez votre e-mail et votre mot de passe.","error");return;}
  authMessage("Connexion…");
  $("#authLoginButton").disabled=true;
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;
    authMessage("");
    await applyAuthenticatedSession(data.session,{openHome:true});
  }catch(err){
    console.error(err);
    authMessage("E-mail ou mot de passe incorrect.","error");
  }finally{$("#authLoginButton").disabled=false;}
}

const ACCESS_FUNCTION_URL=`${SUPABASE_URL}/functions/v1/access-manager`;

async function accessFunction(action,payload={}){
  const {data:{session}}=await sb.auth.getSession();
  const headers={"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY};
  if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
  const r=await fetch(ACCESS_FUNCTION_URL,{method:"POST",headers,body:JSON.stringify({action,...payload})});
  let body={};
  try{body=await r.json();}catch{}
  if(!r.ok||body.error)throw new Error(body.error||`Erreur ${r.status}`);
  return body;
}
async function registerFirstAccess(){
  const button=document.getElementById("registerButton");
  const status=document.getElementById("activationStatus");
  const show=(msg,type="error")=>{
    if(status){
      status.textContent=msg||"";
      status.dataset.type=type;
    }
    authMessage(msg,type);
  };

  try{
    const email=(document.getElementById("registerEmail")?.value||"").trim().toLowerCase();
    const code=(document.getElementById("activationCode")?.value||"").trim().toUpperCase();
    const p1=document.getElementById("registerPassword")?.value||"";
    const p2=document.getElementById("registerPassword2")?.value||"";

    if(!email){show("Entrez votre adresse e-mail.");return;}
    if(!code){show("Entrez votre code d’activation UPG-XXXX-XXXX.");return;}
    if(p1.length<8){
      show("Le mot de passe doit contenir au moins 8 caractères.");
      document.getElementById("registerPassword")?.focus();
      return;
    }
    if(p1!==p2){
      show("Les deux mots de passe ne correspondent pas.");
      document.getElementById("registerPassword2")?.focus();
      return;
    }

    if(button)button.disabled=true;
    show("Activation de votre accès…","info");

    const result=await accessFunction("activate",{email,code,password:p1});
    if(!result?.ok)throw new Error("L’activation n’a pas été confirmée.");

    show("Accès activé. Connexion…","success");
    const {data,error}=await sb.auth.signInWithPassword({email,password:p1});
    if(error)throw error;

    document.getElementById("registerPanel")?.classList.add("hidden");
    if(status)status.textContent="";
    authMessage("");
    await applyAuthenticatedSession(data.session,{openHome:true});
  }catch(err){
    console.error("Activation UniPop:",err);
    show(err?.message||String(err)||"Activation impossible.");
  }finally{
    if(button)button.disabled=false;
  }
}
function openCodePanel(){
  const activationStatus=document.getElementById("activationStatus");if(activationStatus)activationStatus.textContent="";
  $("#registerEmail").value=$("#authEmail").value.trim();
  $("#registerPanel").classList.remove("hidden");
  $("#recoveryPanel").classList.add("hidden");
  authMessage("Demandez un nouveau code d’activation à UniPop si nécessaire.");
}
async function saveRecoveryPassword(){
  authMessage("Utilisez votre code d’activation pour choisir un nouveau mot de passe.","error");
  openCodePanel();
}
async function logout(){
  await sb.auth.signOut();
  authProfile=null;authSession=null;currentTrainer=null;trainerCourses=[];
  setAuthView(false);
  showScreen("loginScreen",false);
}
async function initAuth(){
  sb.auth.onAuthStateChange(async(event,session)=>{
    authSession=session||null;
    if(event==="SIGNED_OUT"){await applyAuthenticatedSession(null);return;}
    if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED"||event==="USER_UPDATED"){
      await applyAuthenticatedSession(session,{openHome:event==="SIGNED_IN"});
    }
  });
  const {data:{session}}=await sb.auth.getSession();
  authSession=session||null;
  await applyAuthenticatedSession(session,{openHome:!!session});
}

$("#authLoginButton")?.addEventListener("click",loginWithPassword);
$("#authPassword")?.addEventListener("keydown",e=>{if(e.key==="Enter")loginWithPassword();});
$("#showRegister")?.addEventListener("click",openCodePanel);
$("#cancelRegister")?.addEventListener("click",()=>$("#registerPanel").classList.add("hidden"));


// v44: activation button + visible validation feedback.
const activationButton=document.getElementById("registerButton");
if(activationButton){
  activationButton.addEventListener("click",(event)=>{
    event.preventDefault();
    registerFirstAccess();
  });
}else{
  console.error("UniPop: registerButton introuvable.");
}
$("#forgotPassword")?.addEventListener("click",openCodePanel);
$("#saveRecoveryPassword")?.addEventListener("click",saveRecoveryPassword);
$("#openAdminButton")?.addEventListener("click",()=>{location.href="admin.html";});
$("#logoutButton")?.addEventListener("click",logout);
$("#accountCoursesButton")?.addEventListener("click",()=>{if(currentTrainer)renderHome();});
$("#accountCalendarButton")?.addEventListener("click",()=>{if(currentTrainer)openCalendar();});

function scheduleRows(c){
  if(Array.isArray(c.horaires)&&c.horaires.length)return c.horaires;
  const rows=[],txt=c.horairePrevu||"",rx=/(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+à\s+(\d{1,2}:\d{2})(?:\s+\(durée\s+([^)]+)\))?/g;
  let m;while((m=rx.exec(txt)))rows.push({jour:m[1],heure:m[2],duree:m[3]||c.duree||""});
  return rows;
}
function occurrencesForCourse(c,from,to){
  const start=parseDate(c.dateDebut),end=parseDate(c.dateFin);if(!start||!end)return[];
  const lo=new Date(Math.max(start.getTime(),from.getTime())),hi=new Date(Math.min(end.getTime(),to.getTime()));if(lo>hi)return[];
  const rows=scheduleRows(c),out=[];
  if(rows.length){
    for(let d=new Date(lo);d<=hi;d.setDate(d.getDate()+1)){
      const day=DAYS[d.getDay()];
      rows.filter(r=>normalizeText(r.jour)===normalizeText(day)).forEach(r=>out.push({course:c,date:new Date(d),time:r.heure||"",duration:r.duree||c.duree||""}));
    }
  }else if(sameDay(start,end)&&start>=from&&start<=to){out.push({course:c,date:start,time:"",duration:c.duree||""});}
  return out;
}
function trainerOccurrences(from,to){return trainerCourses.flatMap(c=>occurrencesForCourse(c,from,to)).sort((a,b)=>a.date-b.date||a.time.localeCompare(b.time));}
function venueLabel(c){const a=c.adresseCours||{};return a.nom||a.localite||"Lieu à confirmer";}
function roomLabel(c){return locationData(c).room||"Salle à confirmer";}

function occurrenceCard(o,type="next"){
  const c=o.course,end=o.time?addMinutes(o.time,minutesFromDuration(o.duration)):"";
  if(type==="today"){
    return `<article class="course-card today occurrence" data-id="${escapeHtml(c.id)}" data-date="${formatDMY(o.date)}" data-time="${escapeHtml(o.time)}">
      <div class="course-left time"><strong>${escapeHtml(o.time||"—")}</strong><span>${escapeHtml(end||"")}</span></div>
      <div class="course-info"><h4>${escapeHtml(c.intitule||"Cours")}</h4><p>${escapeHtml(venueLabel(c))}</p><p>${escapeHtml(roomLabel(c))}</p><span class="green-pill">Aujourd'hui</span></div>
    </article>`;
  }
  return `<article class="course-card occurrence" data-id="${escapeHtml(c.id)}" data-date="${formatDMY(o.date)}" data-time="${escapeHtml(o.time)}">
    <div class="course-left date"><small>${DAYS[o.date.getDay()].slice(0,3).toUpperCase()}</small><b>${o.date.getDate()}</b><small>${MONTHS_SHORT[o.date.getMonth()]}</small></div>
    <div class="course-info"><div class="line1">${escapeHtml(o.time||"—")}${end?` – ${escapeHtml(end)}`:""}</div><h4>${escapeHtml(c.intitule||"Cours")}</h4><p>${escapeHtml(venueLabel(c))} – ${escapeHtml(roomLabel(c))}</p></div>
    <div class="chev">›</div>
  </article>`;
}
function bindOccurrences(){
  $$(".occurrence").forEach(el=>el.onclick=()=>{
    const course=trainerCourses.find(c=>String(c.id)===String(el.dataset.id));
    selectedOccurrence={course,date:parseDate(el.dataset.date),time:el.dataset.time};
    renderDetail();showScreen("detailScreen");
  });
}
function renderHome(){
  const first=currentTrainer.split(/\s+/)[0];
  $("#helloName").textContent=`Bonjour ${first} 👋`;
  const now=new Date(),todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()),todayEnd=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59),futureEnd=new Date(now);
  futureEnd.setDate(futureEnd.getDate()+240);
  const today=trainerOccurrences(todayStart,todayEnd),next=trainerOccurrences(now,futureEnd).slice(0,8);
  $("#todayCourse").innerHTML=today.length?today.map(o=>occurrenceCard(o,"today")).join(""):`<div class="empty-card">Aucun cours prévu aujourd'hui.</div>`;
  $("#nextCourses").innerHTML=next.length?next.map(o=>occurrenceCard(o)).join(""):`<div class="empty-card">Aucun prochain cours trouvé.</div>`;
  bindOccurrences();showScreen("homeScreen",false);
}

function technicalGuideById(id){
  if(!id)return null;
  return (sitesData.guides||[]).find(g=>String(g.id)===String(id))||null;
}
function guideUrl(g){
  if(!g)return "";
  return g.path?siteAssetUrl(g.path):(g.url||"");
}
function technicalGuideForCourse(site,room){
  // A confirmed room only shows its own explicitly assigned guide/tutorial.
  // It intentionally does not inherit the lieu guide.
  if(room){
    if(room.tutorialGuidePath){
      const tut=(site?.tutorials||[]).find(t=>String(t.path||t.url)===String(room.tutorialGuidePath));
      return tut?{...tut,_isTutorialGuide:true}:{path:room.tutorialGuidePath,title:'Tutoriel'};
    }
    return technicalGuideById(room.guideId);
  }
  return technicalGuideById(site?.guideId);
}
function guideButtonHtml(g){
  const u=guideUrl(g);
  if(!g||!u)return "";
  return `<button class="blue-btn technical-guide-link" type="button" data-guide-url="${escapeHtml(u)}">Voir le guide technique</button>${g.description?`<p class="technical-guide-note">${escapeHtml(g.description)}</p>`:""}`;
}

function ensureGuideViewer(){
  let viewer=document.getElementById("guideViewerOverlay");
  if(viewer)return viewer;
  const style=document.createElement("style");
  style.textContent=`
        html.guide-viewer-open,
    body.guide-viewer-open{background:#071a2b !important;min-height:100%;overscroll-behavior:none}
    body.guide-viewer-open{margin:0}
#guideViewerOverlay{position:fixed;inset:0;width:100vw;height:100dvh;min-height:100vh;z-index:99999;background:#071a2b;display:flex;flex-direction:column;overflow:hidden}
    #guideViewerOverlay.hidden{display:none}
    #guideViewerBar{box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#071a2b;color:#fff;border-bottom:1px solid rgba(255,255,255,.14);flex:0 0 auto}
    #guideViewerBar strong{font-size:16px}
    #guideViewerClose{border:0;border-radius:10px;padding:10px 14px;background:#fff;color:#082039;font-weight:700;cursor:pointer}
    #guideViewerStage{box-sizing:border-box;flex:1 1 auto;width:100%;min-height:100%;overflow:auto;background:#071a2b;overscroll-behavior:contain}
    #guideViewerImage{display:block;width:auto;max-width:1100px;height:auto;margin:0 auto}
    #guideViewerFrame{display:block;width:100%;height:100%;min-height:0;border:0;background:#fff}
    @media(max-width:700px){
      #guideViewerBar{padding:8px 10px}
      #guideViewerBar strong{font-size:14px}
      #guideViewerClose{padding:9px 12px}
      #guideViewerStage{
        width:100vw;
        max-width:100vw;
        overflow-y:auto;
        overflow-x:hidden;
        background:#071a2b;
        padding:0;
        margin:0;
      }
      #guideViewerImage{
        display:block;
        width:92vw;
        max-width:92vw;
        height:auto;
        margin:0 auto;
      }
    }
  `;
  document.head.appendChild(style);
  viewer=document.createElement("div");
  viewer.id="guideViewerOverlay";
  viewer.className="hidden";
  viewer.innerHTML=`<div id="guideViewerBar"><strong>Guide technique</strong><button id="guideViewerClose" type="button">← Retour</button></div><div id="guideViewerStage"><img id="guideViewerImage" alt="Guide technique" hidden><iframe id="guideViewerFrame" title="Guide technique" hidden></iframe></div>`;
  document.body.appendChild(viewer);
  document.getElementById("guideViewerClose").onclick=closeGuideViewer;
  return viewer;
}
let guideViewerObjectUrl="";
async function openGuideViewer(url){
  if(!url)return;
  const viewer=ensureGuideViewer();
  const frame=document.getElementById("guideViewerFrame");
  const image=document.getElementById("guideViewerImage");
  viewer.classList.remove("hidden");
  document.documentElement.classList.add("guide-viewer-open");
  document.body.classList.add("guide-viewer-open");
  document.body.style.overflow="hidden";

  frame.hidden=true;
  frame.removeAttribute("srcdoc");
  frame.src="about:blank";
  image.hidden=true;
  image.removeAttribute("src");

  try{
    if(guideViewerObjectUrl){
      URL.revokeObjectURL(guideViewerObjectUrl);
      guideViewerObjectUrl="";
    }

    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const blob=await res.blob();
    guideViewerObjectUrl=URL.createObjectURL(blob);

    const type=(blob.type||"").toLowerCase();
    const looksLikeImage=type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif|svg)(?:$|[?#])/i.test(url);

    if(looksLikeImage){
      image.onload=()=>{
        const stage=document.getElementById("guideViewerStage");
        if(stage){
          stage.scrollTop=0;
          stage.scrollLeft=0;
        }
      };
      image.src=guideViewerObjectUrl;
      image.hidden=false;
    }else{
      frame.src=guideViewerObjectUrl;
      frame.hidden=false;
    }
  }catch(err){
    frame.hidden=false;
    frame.removeAttribute("src");
    frame.srcdoc=`<div style="font-family:system-ui;padding:24px;line-height:1.5">
      <h2>Guide technique</h2>
      <p>Le document ne peut pas être affiché directement ici.</p>
      <p><button onclick="window.open(${JSON.stringify(url)},'_blank','noopener')" style="padding:10px 14px;font-weight:700">Ouvrir le document</button></p>
    </div>`;
    console.warn("Guide viewer:",err);
  }
}
function closeGuideViewer(){
  const viewer=document.getElementById("guideViewerOverlay");
  if(!viewer)return;
  viewer.classList.add("hidden");
  const frame=document.getElementById("guideViewerFrame");
  const image=document.getElementById("guideViewerImage");
  if(frame){
    frame.hidden=true;
    frame.removeAttribute("srcdoc");
    frame.src="about:blank";
  }
  if(image){
    image.hidden=true;
    image.removeAttribute("src");
  }
  if(guideViewerObjectUrl){
    URL.revokeObjectURL(guideViewerObjectUrl);
    guideViewerObjectUrl="";
  }
  document.body.style.overflow="";
  document.documentElement.classList.remove("guide-viewer-open");
  document.body.classList.remove("guide-viewer-open");
}
document.addEventListener("click",e=>{
  const btn=e.target.closest?.(".technical-guide-link[data-guide-url]");
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  openGuideViewer(btn.dataset.guideUrl);
});

function renderDetail(){
  const{course:c,date,time}=selectedOccurrence,loc=locationData(c),site=loc.site,room=loc.room,a=c.adresseCours||{};
  const row=scheduleRows(c).find(x=>x.heure===time),dur=row?.duree||c.duree||"",end=time?addMinutes(time,minutesFromDuration(dur)):"";
  const roomName=room?.name||(isRoomConfirmed(loc.room)?loc.room:"Salle à confirmer");
  $("#detailIntro").innerHTML=`<div class="when">${escapeHtml(time||"")}${end?` – ${escapeHtml(end)}`:""}</div><div class="date">${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}</div><h1>${escapeHtml(c.intitule||"Cours")}</h1><p>⌖ ${escapeHtml(venueLabel(c))} – ${escapeHtml(roomName)}</p>`;

  const address=site?.address||[a.rueNumero,[a.codePostal,a.localite].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  const hero=site?siteAssetUrl(site.hero||site.heroThumb||""):"";
  const gallery=site?[...(site.gallery||[]).filter(g=>g.path)]:[];
  const access=[];
  if(site?.parking)access.push({icon:"P",title:site.parking,text:site.parkingInfo||""});
  if(site?.transport)access.push({icon:"▣",title:site.transport,text:site.transportInfo||""});
  if(site?.accessInfo)access.push({icon:"→",title:"Accès",text:site.accessInfo});
  if(site?.pmr)access.push({icon:"♿",title:"Accès PMR",text:"Accessible PMR"});
  const plans=(site?.plans||[]).filter(x=>x.path||x.url), tutorials=(site?.tutorials||[]).filter(x=>x.path||x.url);
  const media=(site?.media||[]).filter(x=>x.path||x.url);
  const roomGallery=(room?.gallery||[]).filter(x=>x.path);
  const techGuide=technicalGuideForCourse(site,room);
  const fileRows=(items,icon)=>items.map(x=>{const u=x.path?siteAssetUrl(x.path):x.url;return `<a href="${escapeHtml(u||"#")}" target="_blank" rel="noopener">${icon} <span>${escapeHtml(x.name||x.title||"Document")}</span><b>Ouvrir</b></a>`}).join("");
  const contact=site?[site.website&&`<a href="${escapeHtml(/^https?:\/\//i.test(site.website)?site.website:'https://'+site.website)}" target="_blank" rel="noopener">🌐 <span>Site web</span><b>Ouvrir</b></a>`,site.phone&&`<a href="tel:${escapeHtml(site.phone)}">☎️ <span>${escapeHtml(site.phone)}</span><b>Appeler</b></a>`,site.email&&`<a href="mailto:${escapeHtml(site.email)}">✉️ <span>${escapeHtml(site.email)}</span><b>Écrire</b></a>`].filter(Boolean).join(""):"";
  const hasGps=site&&Number.isFinite(Number(site.lat))&&Number.isFinite(Number(site.lng))&&site.lat!==""&&site.lng!=="";
  const map=hasGps?`<iframe class="course-map-frame" loading="lazy" title="Carte du lieu" src="https://www.openstreetmap.org/export/embed.html?bbox=${Number(site.lng)-.008}%2C${Number(site.lat)-.005}%2C${Number(site.lng)+.008}%2C${Number(site.lat)+.005}&layer=mapnik&marker=${Number(site.lat)}%2C${Number(site.lng)}"></iframe>`:"";

  $("#courseSiteDetail").innerHTML=`
    <h4>Adresse</h4><p class="course-address">${escapeHtml(address).replace(/\n/g,"<br>")}</p>
    ${site?.description?`<p class="course-site-description">${escapeHtml(site.description)}</p>`:""}
    ${hero?`<img class="course-building-hero" src="${escapeHtml(hero)}" alt="${escapeHtml(site.name||"Lieu")}">`:""}
    ${gallery.length?`<h4>Photos du lieu</h4><div class="course-gallery">${gallery.map(g=>`<img src="${escapeHtml(siteAssetUrl(g.path))}" alt="${escapeHtml(g.name||"Photo")}">`).join("")}</div>`:""}
    ${access.length?`<h4>Accès & transport</h4><div class="course-access-grid">${access.map(x=>`<div class="course-access-card"><span>${escapeHtml(x.icon)}</span><div><b>${escapeHtml(x.title)}</b>${x.text?`<small>${escapeHtml(x.text)}</small>`:""}</div></div>`).join("")}</div>`:""}
    ${room?`<h4>Salle</h4><article class="course-room-card">${room.hero?`<img src="${escapeHtml(siteAssetUrl(room.hero))}" alt="${escapeHtml(room.name||"Salle")}">`:""}<div><h3>${escapeHtml(room.name||"Salle")}</h3>${room.floor?`<p><b>Étage:</b> ${escapeHtml(room.floor)}</p>`:""}${room.directions?`<p><b>Chemin:</b> ${escapeHtml(room.directions)}</p>`:""}${room.description?`<p>${escapeHtml(room.description)}</p>`:""}${(room.equipment||[]).length?`<div class="equipment-pills">${room.equipment.map(e=>`<span>${escapeHtml(e)}</span>`).join("")}</div>`:""}${roomGallery.length?`<div class="course-room-gallery">${roomGallery.map(g=>`<img src="${escapeHtml(siteAssetUrl(g.path))}" alt="${escapeHtml(g.name||room.name||"Salle")}">`).join("")}</div>`:""}</div></article>`:`<h4>Salle</h4><div class="course-room-pending">Salle à confirmer</div>`}
    ${techGuide?`<div class="course-guide-box"><h4>Guide technique</h4>${guideButtonHtml(techGuide)}</div>`:""}
    ${plans.length?`<h4>Plans & documents</h4><div class="course-files">${fileRows(plans,"▱")}</div>`:""}
    ${media.length?`<h4>Médias</h4><div class="course-files">${fileRows(media,"▧")}</div>`:""}
    ${tutorials.length?`<h4>Tutoriels</h4><div class="course-files">${fileRows(tutorials,"▶")}</div>`:""}
    ${contact?`<h4>Contact</h4><div class="course-files">${contact}</div>`:""}
    ${map?`<h4>Carte</h4>${map}`:""}`;

  const query=site&&hasGps?`${site.lat},${site.lng}`:(siteAddressOneLine(site||{})||address.replace(/\n/g,", "));
  $("#routeButton").onclick=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,"_blank");
  $("#phoneButton").disabled=!site?.phone;
  $("#phoneButton").onclick=()=>{if(site?.phone)location.href=`tel:${site.phone}`};
  $("#icsButton").onclick=downloadICS;
}
function renderTech(loc,c){
  $("#techTitle").textContent=`Guide technique – ${roomLabel(c)}`;
  const steps=loc.tech||[];
  $("#techSteps").innerHTML=(steps.length?steps:[
    {title:"1. Allumer l'ordinateur",icon:"⏻"},{title:"2. Démarrer le projecteur",icon:"◉"},{title:"3. Sélectionner la source (HDMI)",icon:"HDMI 1"},{title:"4. Régler le son",icon:"🔊"}
  ]).map(s=>`<section class="tech-step"><h3>${escapeHtml(s.title)}</h3><div class="tech-image" ${s.image?`style="background-image:url('${escapeHtml(s.image)}')"`:""}>${s.image?"":escapeHtml(s.icon||"")}</div>${s.text?`<p>${escapeHtml(s.text)}</p>`:""}</section>`).join("");
}
function downloadICS(){
  const{course:c,date,time}=selectedOccurrence,a=c.adresseCours||{},row=scheduleRows(c).find(x=>x.heure===time);
  const mins=minutesFromDuration(row?.duree||c.duree||"")||60,[h,m]=(time||"09:00").split(":").map(Number),start=new Date(date.getFullYear(),date.getMonth(),date.getDate(),h,m),end=new Date(start.getTime()+mins*60000);
  const z=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}00`;
  const body=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:${z(start)}\r\nDTEND:${z(end)}\r\nSUMMARY:${c.intitule||"Cours UniPop"}\r\nLOCATION:${[a.nom,a.rueNumero,a.localite].filter(Boolean).join(", ")}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const blob=new Blob([body],{type:"text/calendar"}),u=URL.createObjectURL(blob),link=document.createElement("a");link.href=u;link.download="cours-unipop.ics";link.click();URL.revokeObjectURL(u);
}

function openCalendar(){
  const now=new Date();
  const horizon=new Date(now);
  horizon.setFullYear(horizon.getFullYear()+2);

  const upcoming=trainerOccurrences(now,horizon);

  if(upcoming.length){
    selectedDate=new Date(upcoming[0].date);
    calendarCursor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
  }else{
    selectedDate=new Date();
    calendarCursor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
  }

  renderCalendar();
  showScreen("calendarScreen");
}
$("#calendarButton").onclick=openCalendar;$("#calendarTopButton").onclick=openCalendar;
$("#prevMonth").onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar();};
$("#nextMonth").onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();};

function renderMiniCourse(o){
  const c=o.course;return `<div class="mini-course occurrence" data-id="${escapeHtml(c.id)}" data-date="${formatDMY(o.date)}" data-time="${escapeHtml(o.time)}"><div class="time">${escapeHtml(o.time||"—")}${o.time?` – ${escapeHtml(addMinutes(o.time,minutesFromDuration(o.duration)))}`:""}</div><h4>${escapeHtml(c.intitule||"Cours")}</h4><p>${escapeHtml(venueLabel(c))} – ${escapeHtml(roomLabel(c))}</p></div>`;
}
function renderCalendar(){
  $("#monthTitle").textContent=`${MONTHS[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}`;

  const monthStart=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1);
  const gridStart=new Date(monthStart);
  gridStart.setDate(gridStart.getDate()-((gridStart.getDay()+6)%7));

  const gridEnd=new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate()+41);

  // Get every course occurrence visible in the six-week calendar grid.
  const occ=trainerOccurrences(gridStart,gridEnd);

  // Group them by day so one glance reveals every teaching date.
  const byDate=new Map();
  occ.forEach(o=>{
    const key=formatDMY(o.date);
    if(!byDate.has(key)) byDate.set(key,[]);
    byDate.get(key).push(o);
  });

  let html="";
  for(let i=0;i<42;i++){
    const d=new Date(gridStart);
    d.setDate(gridStart.getDate()+i);

    const key=formatDMY(d);
    const courses=byDate.get(key)||[];
    const hasCourse=courses.length>0;
    const isSelected=sameDay(d,selectedDate);

    const timeHint=hasCourse
      ? courses.map(x=>x.time||"Cours").join(", ")
      : "";

    html+=`<button
      class="${d.getMonth()!==calendarCursor.getMonth()?"other ":""}${isSelected?"selected ":""}${hasCourse?"has-course ":""}"
      data-date="${key}"
      aria-label="${d.getDate()} ${MONTHS[d.getMonth()]}${hasCourse?`, cours ${timeHint}`:""}"
      title="${hasCourse?`Cours: ${timeHint}`:""}"
    >
      <span class="day-number">${d.getDate()}</span>
      ${hasCourse?`<span class="course-marker">${courses.length>1?courses.length:""}</span>`:""}
    </button>`;
  }

  $("#calendarGrid").innerHTML=html;

  $$("#calendarGrid button").forEach(b=>b.onclick=()=>{
    selectedDate=parseDate(b.dataset.date);
    calendarCursor=new Date(selectedDate.getFullYear(),selectedDate.getMonth(),1);
    renderCalendar();
  });

  const selectedKey=formatDMY(selectedDate);
  const day=byDate.get(selectedKey) || trainerOccurrences(
    new Date(selectedDate.getFullYear(),selectedDate.getMonth(),selectedDate.getDate()),
    new Date(selectedDate.getFullYear(),selectedDate.getMonth(),selectedDate.getDate(),23,59,59)
  );

  $("#selectedDayTitle").textContent=`Cours du ${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  $("#selectedDayCourses").innerHTML=day.length
    ? day.map(renderMiniCourse).join("")
    : `<div class="empty-card">Aucun cours ce jour-là.</div>`;

  // Always show the next courses, not only the next 60 days.
  const futureStart=new Date(selectedDate.getTime()+86400000);
  const futureEnd=new Date(selectedDate);
  futureEnd.setFullYear(futureEnd.getFullYear()+2);

  const other=trainerOccurrences(futureStart,futureEnd).slice(0,6);
  $("#calendarOtherCourses").innerHTML=other.length
    ? other.map(renderMiniCourse).join("")
    : `<div class="empty-card">Aucun autre cours trouvé.</div>`;

  bindOccurrences();
}
function siteAssetUrl(path){
  if(!path)return "";
  try{return new URL(path,SITES_URL).href}catch{return path}
}
function siteAddressOneLine(site){return String(site.address||"").split(/\n+/).filter(Boolean).join(", ")}
function findSiteForCourse(c){
  if(!sitesData.locations?.length)return null;
  const venue=normalizeText(venueLabel(c));
  const a=c.adresseCours||{};
  const addr=normalizeText([a.rueNumero,a.codePostal,a.localite].filter(Boolean).join(" "));
  return sitesData.locations.find(site=>{
    const names=[site.name,...(site.aliases||[])].map(normalizeText);
    const siteAddr=normalizeText(site.address||"");
    return names.some(n=>n&&(venue.includes(n)||n.includes(venue))) || (addr&&siteAddr&&(siteAddr.includes(addr)||addr.includes(siteAddr)));
  })||null;
}
function courseIsCurrentOrFuture(c){
  const today=new Date();today.setHours(0,0,0,0);
  const end=parseDate(c.dateFin)||parseDate(c.dateDebut);
  // If the catalogue has no usable date, keep the location visible rather than hiding useful data.
  return !end || end>=today;
}
function trainerPlaceCourses(){
  const relevant=trainerCourses.filter(courseIsCurrentOrFuture);
  // If every course is historical, fall back to all trainer courses so the Lieux tab is never misleadingly empty.
  return relevant.length?relevant:trainerCourses;
}
function renderPlaces(){
  if(!currentTrainer){
    $("#placesList").innerHTML=`<div class="empty-card">Sélectionnez d'abord un formateur.</div>`;
    return;
  }

  const courses=trainerPlaceCourses();
  const matchedSites=new Map();
  const unmatchedCourses=new Map();

  courses.forEach(c=>{
    const site=findSiteForCourse(c);
    if(site && site.active!==false){
      matchedSites.set(String(site.id),site);
    }else{
      const key=locationKey(c)||normalizeText(venueLabel(c));
      if(key)unmatchedCourses.set(key,c);
    }
  });

  const siteCards=[...matchedSites.values()].map(site=>`<section class="place-card dynamic-place" data-site-id="${escapeHtml(site.id)}">${site.heroThumb||site.hero?`<img class="place-list-thumb" src="${escapeHtml(siteAssetUrl(site.heroThumb||site.hero))}" alt="">`:""}<div><h3>${escapeHtml(site.name||"Lieu")}</h3><p>${escapeHtml(siteAddressOneLine(site))}</p><p><strong>${escapeHtml((site.rooms||[]).length?`${site.rooms.length} salle${site.rooms.length>1?"s":""}`:"Salle à confirmer")}</strong></p><p>${escapeHtml(site.accessInfo||site.description||"Informations détaillées disponibles.")}</p></div><span class="place-chevron">›</span></section>`);

  const fallbackCards=[...unmatchedCourses.values()].map(c=>{
    const a=c.adresseCours||{},loc=locationData(c);
    return `<section class="place-card"><div><h3>${escapeHtml(venueLabel(c))}</h3><p>${escapeHtml([a.rueNumero,a.codePostal,a.localite].filter(Boolean).join(", "))}</p><p><strong>${escapeHtml(roomLabel(c))}</strong></p><p>${escapeHtml(loc.access||"Informations du lieu bientôt disponibles.")}</p></div></section>`;
  });

  $("#placesList").innerHTML=[...siteCards,...fallbackCards].join("")||`<div class="empty-card">Aucun lieu trouvé pour les cours de ce formateur.</div>`;
  $$(".dynamic-place").forEach(el=>el.onclick=()=>openSite(el.dataset.siteId));
}
function openSite(id){
  selectedSite=(sitesData.locations||[]).find(x=>String(x.id)===String(id));
  if(!selectedSite)return;
  renderSiteDetail();showScreen("placeDetailScreen");
}
function renderSiteDetail(){
  const s=selectedSite;if(!s)return;
  $("#placeDetailTopTitle").textContent=s.name||"Lieu";
  $("#placeName").textContent=s.name||"";
  $("#placeAddress").innerHTML=escapeHtml(s.address||"").replace(/\n/g,"<br>");

  const hero=siteAssetUrl(s.hero||s.heroThumb||"");
  $("#placeHero").src=hero;
  $("#placeHero").classList.toggle("hidden",!hero);
  $("#placeDescription").textContent=s.description||"";
  $("#placeDescription").classList.toggle("hidden",!s.description);

  const hasGps=s.lat!==""&&s.lng!==""&&Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng));
  const lat=Number(s.lat),lng=Number(s.lng);
  const query=hasGps?`${lat},${lng}`:siteAddressOneLine(s);
  $("#placeGoogleMaps").onclick=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,"_blank");
  $("#placeAppleMaps").onclick=()=>window.open(`https://maps.apple.com/?q=${encodeURIComponent(s.name||"")}${hasGps?`&ll=${lat},${lng}`:""}`,"_blank");

  const access=[];
  if(s.parking)access.push({icon:"P",title:s.parking,text:s.parkingInfo||""});
  if(s.transport)access.push({icon:"▣",title:s.transport,text:s.transportInfo||""});
  if(s.accessInfo)access.push({icon:"→",title:"Accès",text:s.accessInfo});
  if(s.pmr)access.push({icon:"♿",title:"Accès PMR",text:"Accessible PMR"});
  $("#placeAccessCards").innerHTML=access.map(a=>`<div class="place-access-card"><span>${escapeHtml(a.icon)}</span><div><b>${escapeHtml(a.title)}</b>${a.text?`<small>${escapeHtml(a.text)}</small>`:""}</div></div>`).join("")||`<div class="empty-card">Informations d'accès à compléter.</div>`;

  const gallery=[...(s.gallery||[]),...(s.media||[]).filter(m=>m.type?.startsWith("image/"))].filter(x=>x.path);
  $("#placeGallery").innerHTML=gallery.map(g=>`<img src="${escapeHtml(siteAssetUrl(g.path))}" alt="${escapeHtml(g.name||"Photo")}">`).join("");
  $("#placeGallerySection").classList.toggle("hidden",gallery.length===0);

  const rooms=s.rooms||[];
  $("#placeRooms").innerHTML=rooms.map(r=>{
    const roomGallery=(r.gallery||[]).filter(g=>g.path);
    return `<article class="place-room-card">
      ${r.hero?`<img class="place-room-hero" src="${escapeHtml(siteAssetUrl(r.hero))}" alt="${escapeHtml(r.name||"Salle")}">`:""}
      <div>
        <h4>${escapeHtml(r.name||"Salle")}</h4>
        ${r.floor?`<p><b>Étage:</b> ${escapeHtml(r.floor)}</p>`:""}
        ${r.description?`<p>${escapeHtml(r.description)}</p>`:""}
        ${r.directions?`<p><b>Chemin:</b> ${escapeHtml(r.directions)}</p>`:""}
        ${(r.equipment||[]).length?`<div class="equipment-pills">${r.equipment.map(e=>`<span>${escapeHtml(e)}</span>`).join("")}</div>`:""}
        ${technicalGuideForCourse(s,r)?guideButtonHtml(technicalGuideForCourse(s,r)):""}
        ${roomGallery.length?`<div class="place-room-gallery">${roomGallery.map(g=>`<img src="${escapeHtml(siteAssetUrl(g.path))}" alt="${escapeHtml(g.name||r.name||"Salle")}">`).join("")}</div>`:""}
      </div>
    </article>`;
  }).join("");
  $("#placeRoomsSection").classList.toggle("hidden",rooms.length===0);

  const siteGuide=technicalGuideById(s.guideId);
  const guideHost=document.getElementById("placeGuideSection");
  if(guideHost){guideHost.innerHTML=siteGuide?`<h3>Guide technique</h3>${guideButtonHtml(siteGuide)}`:"";guideHost.classList.toggle("hidden",!siteGuide)}

  const plans=(s.plans||[]).filter(p=>p.path||p.url);
  $("#placePlans").innerHTML=plans.map(p=>{const u=p.path?siteAssetUrl(p.path):p.url;return `<a href="${escapeHtml(u||"#")}" target="_blank" rel="noopener">▱ <span>${escapeHtml(p.name||p.title||"Plan / document")}</span><b>Ouvrir</b></a>`}).join("");
  $("#placePlansSection").classList.toggle("hidden",plans.length===0);

  const media=(s.media||[]).filter(m=>!m.type?.startsWith("image/")&&(m.path||m.url));
  $("#placeMedia").innerHTML=media.map(m=>{const u=m.path?siteAssetUrl(m.path):m.url;return `<a href="${escapeHtml(u||"#")}" target="_blank" rel="noopener">▧ <span>${escapeHtml(m.name||"Média")}</span><b>Ouvrir</b></a>`}).join("");
  $("#placeMediaSection").classList.toggle("hidden",media.length===0);

  const tutorials=s.tutorials||[];
  $("#placeTutorials").innerHTML=tutorials.map(t=>{const u=t.path?siteAssetUrl(t.path):t.url;return `<a href="${escapeHtml(u||"#")}" target="_blank" rel="noopener">▶ <span>${escapeHtml(t.title||t.name||"Tutoriel")}</span><b>Ouvrir</b></a>`}).join("");
  $("#placeTutorialsSection").classList.toggle("hidden",tutorials.length===0);

  const contact=[];
  if(s.website)contact.push(`<a href="${escapeHtml(s.website)}" target="_blank" rel="noopener">🌐 <span>Site web</span><b>Ouvrir</b></a>`);
  if(s.phone)contact.push(`<a href="tel:${escapeHtml(s.phone)}">☎ <span>${escapeHtml(s.phone)}</span><b>Appeler</b></a>`);
  if(s.email)contact.push(`<a href="mailto:${escapeHtml(s.email)}">✉ <span>${escapeHtml(s.email)}</span><b>Écrire</b></a>`);
  $("#placeContact").innerHTML=contact.join("");
  $("#placeContactSection").classList.toggle("hidden",contact.length===0);

  if(hasGps){
    $("#placeMapFrame").src=`https://www.openstreetmap.org/export/embed.html?bbox=${lng-.01}%2C${lat-.006}%2C${lng+.01}%2C${lat+.006}&layer=mapnik&marker=${lat}%2C${lng}`;
    $("#placeMapSection").classList.remove("hidden");
  }else{
    $("#placeMapFrame").removeAttribute("src");
    $("#placeMapSection").classList.add("hidden");
  }
}

$$(".global-tabs .tab").forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.go;
  if(id==="loginScreen"){showScreen("loginScreen",false);return;}
  if(!authProfile?.active||!currentTrainer){showScreen("loginScreen",false);return;}
  if(id==="homeScreen")renderHome();
  else if(id==="calendarScreen")openCalendar();
  else if(id==="placesScreen"){renderPlaces();showScreen("placesScreen");}
});

async function bootstrap(){
  await loadAll();
  await initAuth();
}
bootstrap();
