
const SUPABASE_URL="https://tbjlwhbwcxdvagjoonwb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_z2AUPoYHLMqxxizwKrjhwQ_tESJhSxp";
const DATA_URL="https://raw.githubusercontent.com/letzbug/franks_magic/ee1deb187cb56360699bb18606d7685de65d9e6c/data/trainings.json";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const $=s=>document.querySelector(s);
let adminProfile=null;
let trainerNames=[];

function normalizeText(s=""){return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function teacherName(e){return `${e.prenom||""} ${e.nom||""}`.trim();}
function setStatus(el,msg,type=""){
  el.textContent=msg||"";
  el.className="status"+(type?" "+type:"");
}
async function loadTrainerNames(){
  try{
    const r=await fetch(DATA_URL,{cache:"no-store"});
    const trainings=await r.json();
    const map=new Map();
    trainings.forEach(c=>(c.enseignants||[]).forEach(e=>{
      const n=teacherName(e);if(n)map.set(normalizeText(n),n);
    }));
    trainerNames=[...map.values()].sort((a,b)=>a.localeCompare(b,"fr"));
    $("#trainerNames").innerHTML=trainerNames.map(n=>`<option value="${n.replaceAll('"','&quot;')}"></option>`).join("");
  }catch(e){console.warn(e);}
}
async function loadAdminProfile(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return false;
  const {data,error}=await sb.from("trainer_access")
    .select("id,email,trainer_name,role,active,auth_user_id")
    .eq("auth_user_id",session.user.id).maybeSingle();
  if(error||!data||!data.active||data.role!=="admin")return false;
  adminProfile=data;
  $("#adminIdentity").textContent=`${data.trainer_name||"Administrateur"} · ${data.email}`;
  return true;
}
function renderUser(u){
  const active=u.active!==false;
  const linked=!!u.auth_user_id;
  const self=u.id===adminProfile?.id;
  return `<article class="user-card" data-id="${u.id}">
    <div class="user-info">
      <strong>${u.trainer_name||"Administrateur UniPop Go"}</strong>
      <span>${u.email}</span>
      <div class="user-meta">
        <span class="badge ${active?"active":"blocked"}">${active?"Actif":"Bloqué"}</span>
        <span class="badge">${u.role==="admin"?"Administrateur":"Formateur"}</span>
        <span class="badge">${linked?"Compte créé":"Première connexion en attente"}</span>
      </div>
    </div>
    <div class="user-actions">
      ${self?"":`<button class="ghost toggle-user">${active?"Bloquer":"Réactiver"}</button>`}
      <button class="ghost reset-user">Reset mot de passe</button>
      ${self?"":`<button class="danger delete-user">Supprimer l’accès</button>`}
    </div>
  </article>`;
}
async function loadUsers(){
  const {data,error}=await sb.from("trainer_access")
    .select("id,email,trainer_name,role,active,auth_user_id,created_at,updated_at")
    .order("trainer_name",{ascending:true});
  if(error){$("#usersList").innerHTML=`<p>${error.message}</p>`;return;}
  $("#userCount").textContent=`${data.length} accès`;
  $("#usersList").innerHTML=data.map(renderUser).join("")||"<p>Aucun accès.</p>";

  document.querySelectorAll(".toggle-user").forEach(b=>b.onclick=async()=>{
    const card=b.closest(".user-card"),id=card.dataset.id;
    const row=data.find(x=>x.id===id);
    if(!row)return;
    const {error}=await sb.from("trainer_access").update({active:!row.active}).eq("id",id);
    if(error)alert(error.message);else loadUsers();
  });
  document.querySelectorAll(".delete-user").forEach(b=>b.onclick=async()=>{
    const card=b.closest(".user-card"),id=card.dataset.id;
    const row=data.find(x=>x.id===id);
    if(!row||!confirm(`Supprimer l'accès de ${row.trainer_name} ?\n\nSon mot de passe n'est pas stocké dans l'app. Si vous l'autorisez à nouveau plus tard, son compte pourra être relié à nouveau.`))return;
    const {error}=await sb.from("trainer_access").delete().eq("id",id);
    if(error)alert(error.message);else loadUsers();
  });
  document.querySelectorAll(".reset-user").forEach(b=>b.onclick=async()=>{
    const card=b.closest(".user-card"),id=card.dataset.id;
    const row=data.find(x=>x.id===id);
    if(!row)return;
    const redirectTo=location.origin+location.pathname.replace(/admin\.html$/,"index.html")+"?recovery=1";
    const {error}=await sb.auth.resetPasswordForEmail(row.email,{redirectTo});
    if(error)alert(error.message);else alert(`E-mail de réinitialisation envoyé à ${row.email}.`);
  });
}
async function showAdminIfAllowed(){
  const ok=await loadAdminProfile();
  $("#adminLogin").classList.toggle("hidden",ok);
  $("#adminApp").classList.toggle("hidden",!ok);
  $("#adminLogout").classList.toggle("hidden",!ok);
  if(ok){await loadTrainerNames();await loadUsers();}
}
$("#adminLoginButton").onclick=async()=>{
  const email=$("#adminEmail").value.trim(),password=$("#adminPassword").value;
  setStatus($("#adminLoginStatus"),"Connexion…");
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){setStatus($("#adminLoginStatus"),"E-mail ou mot de passe incorrect.","error");return;}
  if(!(await loadAdminProfile())){
    await sb.auth.signOut();
    setStatus($("#adminLoginStatus"),"Ce compte n'a pas les droits administrateur.","error");
    return;
  }
  setStatus($("#adminLoginStatus"),"");
  await showAdminIfAllowed();
};
$("#adminPassword").addEventListener("keydown",e=>{if(e.key==="Enter")$("#adminLoginButton").click()});
$("#adminLogout").onclick=async()=>{await sb.auth.signOut();adminProfile=null;await showAdminIfAllowed();};
$("#refreshUsers").onclick=loadUsers;
$("#addTrainer").onclick=async()=>{
  const name=$("#trainerName").value.trim();
  const email=$("#trainerEmail").value.trim().toLowerCase();
  const role=$("#trainerRole").value;
  if(!email){setStatus($("#addStatus"),"E-mail obligatoire.","error");return;}

  let trainerName=null;
  if(role==="trainer"){
    if(!name){setStatus($("#addStatus"),"Choisissez un formateur.","error");return;}
    const exact=trainerNames.find(n=>normalizeText(n)===normalizeText(name));
    if(!exact){setStatus($("#addStatus"),"Choisissez un formateur présent dans le catalogue.","error");return;}
    trainerName=exact;
  }

  const {error}=await sb.from("trainer_access").insert({trainer_name:trainerName,email,role,active:true});
  if(error){
    if(String(error.message).toLowerCase().includes("duplicate")){
      setStatus($("#addStatus"),"Cette adresse e-mail est déjà autorisée.","error");
    }else setStatus($("#addStatus"),error.message,"error");
    return;
  }
  $("#trainerName").value="";$("#trainerEmail").value="";
  setStatus($("#addStatus"),"Accès autorisé. Le formateur peut utiliser « Première connexion ».","success");
  await loadUsers();
};
showAdminIfAllowed();
