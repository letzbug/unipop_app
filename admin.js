const SUPABASE_URL="https://tbjlwhbwcxdvagjoonwb.supabase.co";
const KEY="sb_publishable_z2AUPoYHLMqxxizwKrjhwQ_tESJhSxp";
const DATA="https://raw.githubusercontent.com/letzbug/franks_magic/ee1deb187cb56360699bb18606d7685de65d9e6c/data/trainings.json";

let sb=null, users=[], names=[], currentAdmin=null, lastCreatedCode="";
const $=s=>document.querySelector(s);
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

function gateStatus(msg="",error=false){
  const el=$("#gateStatus"); if(!el)return;
  el.textContent=msg; el.className="status"+(error?" error":"");
}
function createStatus(msg="",type=""){
  const el=$("#createStatus"); if(!el)return;
  el.textContent=msg; el.className="status"+(type?` ${type}`:"");
}
async function fn(action,payload={}){
  const {data:{session}}=await sb.auth.getSession();
  const r=await fetch(`${SUPABASE_URL}/functions/v1/access-manager`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":KEY,
      "Authorization":`Bearer ${session?.access_token||""}`
    },
    body:JSON.stringify({action,...payload})
  });
  let body={}; try{body=await r.json()}catch{}
  if(!r.ok||body.error)throw Error(body.error||`Erreur ${r.status}`);
  return body;
}
async function trainerNames(){
  const r=await fetch(DATA,{cache:"no-store"});
  if(!r.ok)throw Error(`Trainings JSON: ${r.status}`);
  const d=await r.json(),m=new Map();
  d.forEach(c=>(c.enseignants||[]).forEach(e=>{
    const n=`${e.prenom||""} ${e.nom||""}`.trim();
    if(n)m.set(norm(n),n);
  }));
  names=[...m.values()].sort((a,b)=>a.localeCompare(b,"fr"));
  $("#names").innerHTML=names.map(n=>`<option value="${n.replaceAll('"',"&quot;")}">`).join("");
}
async function adminProfile(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return null;
  const {data,error}=await sb.from("trainer_access")
    .select("id,email,trainer_name,role,active,deleted_at,auth_user_id")
    .eq("auth_user_id",session.user.id)
    .is("deleted_at",null).maybeSingle();
  if(error)throw error;
  if(!data||data.role!=="admin"||data.active!==true)return null;
  return data;
}
async function boot(){
  try{
    currentAdmin=await adminProfile();
    const ok=!!currentAdmin;
    $("#gate").classList.toggle("hidden",ok);
    $("#app").classList.toggle("hidden",!ok);
    $("#logout").classList.toggle("hidden",!ok);
    if(ok){
      gateStatus("");
      $("#adminIdentity").textContent=`${currentAdmin.trainer_name||"Administrateur UniPop Go"} · ${currentAdmin.email}`;
      await trainerNames();
      await load();
    }
  }catch(e){
    console.error(e); gateStatus(`Erreur: ${e.message}`,true);
  }
}
async function login(){
  const email=$("#email").value.trim(),password=$("#password").value;
  if(!email||!password){gateStatus("E-mail et mot de passe obligatoires.",true);return}
  $("#login").disabled=true; gateStatus("Connexion…");
  try{
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;
    currentAdmin=await adminProfile();
    if(!currentAdmin){await sb.auth.signOut();throw Error("Ce compte n’a pas les droits administrateur.")}
    await boot();
  }catch(e){console.error(e);gateStatus(e.message||"Connexion impossible.",true)}
  finally{$("#login").disabled=false}
}
async function createAccess(){
  let role=$("#role").value,email=$("#trainerEmail").value.trim().toLowerCase(),name=$("#trainer").value.trim();
  $("#createdCode").classList.add("hidden"); createStatus("");
  if(!email){createStatus("E-mail obligatoire.","error");return}
  if(role==="trainer"){
    name=names.find(n=>norm(n)===norm(name));
    if(!name){createStatus("Choisissez un formateur présent dans le catalogue.","error");return}
  }else name=null;
  $("#create").disabled=true;
  try{
    const b=await fn("authorize",{email,trainer_name:name,role});
    lastCreatedCode=b.code||"";
    $("#createdCodeValue").textContent=lastCreatedCode;
    $("#createdCode").classList.toggle("hidden",!lastCreatedCode);
    createStatus(role==="admin"?"Accès administrateur prêt.":"Accès formateur prêt. Transmettez le code d’activation.","success");
    $("#trainer").value="";$("#trainerEmail").value="";
    await load();
  }catch(e){createStatus(e.message,"error")}
  finally{$("#create").disabled=false}
}
function render(){
  const q=$("#search").value.trim().toLowerCase(),filter=$("#roleFilter").value;
  const shown=users.filter(u=>{
    const matchesQ=!q||String(u.trainer_name||"Administrateur UniPop Go").toLowerCase().includes(q)||String(u.email||"").toLowerCase().includes(q);
    const matchesRole=filter==="all"||(filter==="blocked"?!u.active:u.role===filter);
    return matchesQ&&matchesRole;
  });
  const trainers=users.filter(u=>u.role==="trainer").length;
  const admins=users.filter(u=>u.role==="admin").length;
  $("#count").textContent=`${users.length} accès · ${trainers} formateurs · ${admins} administrateur(s)`;
  $("#list").innerHTML=shown.map(u=>{
    const self=u.auth_user_id&&u.auth_user_id===currentAdmin?.auth_user_id;
    return `<article class="row" data-id="${u.id}">
      <div class="who">
        <strong>${u.trainer_name||"Administrateur UniPop Go"}</strong>
        <span>${u.email}</span>
        <div class="badges">
          <span class="badge ${u.active?"ok":"blocked"}">${u.active?"Actif":"Bloqué"}</span>
          <span class="badge">${u.role==="admin"?"Administrateur":"Formateur"}</span>
          ${u.activation_code?'<span class="badge pending">Code en attente</span>':""}
          ${self?'<span class="badge">Votre compte</span>':""}
        </div>
      </div>
      <div class="actions">
        ${u.activation_code?'<button class="code-btn" data-a="copy">Copier code</button>':""}
        <button data-a="reset">Nouveau code</button>
        ${self?"":`<button data-a="toggle">${u.active?"Bloquer":"Réactiver"}</button>`}
        ${self?"":'<button class="danger" data-a="delete">Supprimer</button>'}
      </div>
    </article>`;
  }).join("")||"<p>Aucun accès correspondant.</p>";
  document.querySelectorAll(".row button").forEach(b=>b.addEventListener("click",()=>act(b.closest(".row").dataset.id,b.dataset.a)));
}
async function load(){
  const {data,error}=await sb.from("trainer_access")
    .select("id,email,trainer_name,role,active,activation_code,deleted_at,auth_user_id")
    .is("deleted_at",null).order("trainer_name",{ascending:true,nullsFirst:true});
  if(error)throw error; users=data||[]; render();
}
async function act(id,action){
  const u=users.find(x=>x.id===id); if(!u)return;
  const self=!!(u.auth_user_id&&u.auth_user_id===currentAdmin?.auth_user_id);
  try{
    if(action==="copy"){
      await navigator.clipboard.writeText(u.activation_code);
      alert(`Code copié: ${u.activation_code}`); return;
    }
    if((action==="toggle"||action==="delete")&&self){
      alert("Le compte administrateur actuellement connecté ne peut pas être bloqué ou supprimé.");return;
    }
    if(action==="reset"){
      const b=await fn("reset_code",{id});
      if(b.code){await navigator.clipboard.writeText(b.code).catch(()=>{});}
      alert(`Nouveau code d’activation: ${b.code}`);
    }
    if(action==="toggle")await fn("set_active",{id,active:!u.active});
    if(action==="delete"&&confirm(`Supprimer l’accès de ${u.trainer_name||u.email} ?`))await fn("archive",{id});
    await load();
  }catch(e){alert(e.message)}
}

document.addEventListener("DOMContentLoaded",async()=>{
  try{
    if(!window.supabase?.createClient)throw Error("La bibliothèque Supabase n’a pas pu être chargée.");
    sb=window.supabase.createClient(SUPABASE_URL,KEY);
    $("#login").addEventListener("click",login);
    $("#password").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
    $("#email").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
    $("#logout").addEventListener("click",async()=>{await sb.auth.signOut();currentAdmin=null;await boot()});
    $("#refresh").addEventListener("click",load);
    $("#create").addEventListener("click",createAccess);
    $("#copyCreatedCode").addEventListener("click",async()=>{
      if(!lastCreatedCode)return;
      await navigator.clipboard.writeText(lastCreatedCode);
      createStatus("Code copié.","success");
    });
    $("#role").addEventListener("change",()=>{
      const admin=$("#role").value==="admin";
      $("#trainerField").classList.toggle("hidden",admin);
      if(admin)$("#trainer").value="";
    });
    $("#search").addEventListener("input",render);
    $("#roleFilter").addEventListener("change",render);
    await boot();
  }catch(e){
    console.error(e);gateStatus(`Erreur de démarrage: ${e.message}`,true);
  }
});