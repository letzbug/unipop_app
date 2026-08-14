
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
  if(isIPhone||isAndroidPhone) mode="phone";
  else if(isIPad||isAndroidTablet) mode="tablet";
  else {
    const shortSide=Math.min(window.innerWidth,window.innerHeight);
    if(touch>0&&shortSide<=520) mode="phone";
    else if(touch>0&&shortSide<=1100) mode="tablet";
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

let trainings=[], locations={}, currentTrainer=null, trainerCourses=[], selectedOccurrence=null;
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
function locationData(c){
  const key=locationKey(c);
  const byCourse=locations.courses?.[normalizeText(c.code||c.reference||c.id||"")];
  if(byCourse)return{...locations._default,...byCourse};
  return{...locations._default,...(locations.places?.[key]||{})};
}

async function loadAll(){
  try{
    const[r1,r2]=await Promise.all([fetch(DATA_URL,{cache:"no-store"}),fetch("data/locations.json?v=11",{cache:"no-store"})]);
    if(!r1.ok)throw new Error("trainings.json");
    trainings=await r1.json();locations=await r2.json();
    $("#dataStatus").textContent=`${trainings.length} cours chargés`;
    const saved=localStorage.getItem("unipopTrainer");
    if(saved)$("#trainerInput").value=saved;
  }catch(err){
    console.error(err);
    $("#dataStatus").textContent="Catalogue indisponible — vérifiez la connexion.";
  }
}

function showScreen(id,push=true){
  const active=$(".screen.active");
  if(push&&active&&active.id!==id)backStack.push(active.id);
  $$(".screen").forEach(s=>s.classList.remove("active"));
  const target=$("#"+id);if(target)target.classList.add("active");
  $$(".global-tabs .tab").forEach(t=>t.classList.toggle("active",t.dataset.go===id));
  window.scrollTo(0,0);
}

$$("[data-back]").forEach(b=>b.addEventListener("click",()=>showScreen(backStack.pop()||"homeScreen",false)));

$("#trainerInput").addEventListener("input",()=>{
  const box=$("#suggestions");box.innerHTML="";
  teacherMatches($("#trainerInput").value).forEach(n=>{
    const b=document.createElement("button");b.type="button";b.textContent=n;
    b.onclick=()=>{$("#trainerInput").value=n;box.innerHTML="";};box.appendChild(b);
  });
});
$("#clearTrainer").onclick=()=>{$("#trainerInput").value="";$("#suggestions").innerHTML="";$("#trainerInput").focus();};

$("#loginButton").onclick=()=>{
  const query=$("#trainerInput").value.trim();if(!query)return;
  const match=teacherMatches(query)[0];if(!match){alert("Formateur introuvable dans le catalogue.");return;}
  currentTrainer=match;
  trainerCourses=trainings.filter(c=>(c.enseignants||[]).some(e=>normalizeText(teacherName(e))===normalizeText(match)));
  localStorage.setItem("unipopTrainer",match);
  renderHome();
};

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

function renderDetail(){
  const{course:c,date,time}=selectedOccurrence,loc=locationData(c),a=c.adresseCours||{};
  const row=scheduleRows(c).find(x=>x.heure===time),dur=row?.duree||c.duree||"",end=time?addMinutes(time,minutesFromDuration(dur)):"";
  $("#detailIntro").innerHTML=`<div class="when">${escapeHtml(time||"")}${end?` – ${escapeHtml(end)}`:""}</div><div class="date">${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}</div><h1>${escapeHtml(c.intitule||"Cours")}</h1><p>⌖ ${escapeHtml(venueLabel(c))} – ${escapeHtml(roomLabel(c))}</p>`;
  $("#addressText").innerHTML=[a.rueNumero,[a.codePostal,a.localite].filter(Boolean).join(" ")].filter(Boolean).map(escapeHtml).join("<br>");
  $("#accessText").textContent=loc.access||"Informations d'accès à compléter.";
  const photos=loc.photos||[],defaults=[{label:"Bâtiment",file:"assets/demo-building.jpg"},{label:"Entrée",file:"assets/demo-entry.jpg"},{label:roomLabel(c),file:"assets/demo-room.jpg"}];
  $("#photoGrid").innerHTML=(photos.length?photos:defaults).slice(0,3).map(p=>`<div class="photo-tile" ${p.file?`style="background-image:url('${escapeHtml(p.file)}')"`:""}><span>${escapeHtml(p.label||"Photo")}</span></div>`).join("");
  $("#equipmentGrid").innerHTML=(loc.equipment||[]).map(x=>`<div>${escapeHtml(x)}</div>`).join("");
  const addr=[a.rueNumero,a.codePostal,a.localite,a.paysNom].filter(Boolean).join(", ");
  $("#routeButton").onclick=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`,"_blank");
  $("#phoneButton").onclick=()=>location.href=`tel:${loc.phone||"+35280029001"}`;
  $("#icsButton").onclick=downloadICS;
  $("#techButton").onclick=()=>{renderTech(loc,c);showScreen("techScreen");};
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
function renderPlaces(){
  const seen=new Map();trainerCourses.forEach(c=>seen.set(locationKey(c),c));
  $("#placesList").innerHTML=[...seen.values()].map(c=>{const a=c.adresseCours||{},loc=locationData(c);return `<section class="place-card"><h3>${escapeHtml(venueLabel(c))}</h3><p>${escapeHtml([a.rueNumero,a.codePostal,a.localite].filter(Boolean).join(", "))}</p><p><strong>${escapeHtml(roomLabel(c))}</strong></p><p>${escapeHtml(loc.access||"Informations d'accès à compléter.")}</p></section>`;}).join("")||`<div class="empty-card">Aucun lieu trouvé.</div>`;
}

$$(".global-tabs .tab").forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.go;
  if(id==="loginScreen"){showScreen("loginScreen",false);return;}
  if(!currentTrainer){showScreen("loginScreen",false);return;}
  if(id==="homeScreen")renderHome();
  else if(id==="calendarScreen")openCalendar();
  else if(id==="placesScreen"){renderPlaces();showScreen("placesScreen");}
});

loadAll();
