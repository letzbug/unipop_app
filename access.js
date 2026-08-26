const SUPABASE_URL="https://tbjlwhbwcxdvagjoonwb.supabase.co";
const KEY="sb_publishable_z2AUPoYHLMqxxizwKrjhwQ_tESJhSxp";
const DATA="https://raw.githubusercontent.com/letzbug/franks_magic/ee1deb187cb56360699bb18606d7685de65d9e6c/data/trainings.json";

let sb=null, users=[], names=[];
const $=s=>document.querySelector(s);
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");

function status(msg="",error=false){
  const el=$("#gateStatus");
  if(!el)return;
  el.textContent=msg;
  el.style.color=error?"#ff9e9e":"#91a8bd";
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
  let b={};
  try{b=await r.json()}catch{}
  if(!r.ok||b.error)throw Error(b.error||`Erreur ${r.status}`);
  return b;
}

async function trainerNames(){
  try{
    const r=await fetch(DATA,{cache:"no-store"});
    if(!r.ok)throw Error(`Trainings JSON: ${r.status}`);
    const d=await r.json(),m=new Map();
    d.forEach(c=>(c.enseignants||[]).forEach(e=>{
      const n=`${e.prenom||""} ${e.nom||""}`.trim();
      if(n)m.set(norm(n),n);
    }));
    names=[...m.values()].sort((a,b)=>a.localeCompare(b,"fr"));
    $("#names").innerHTML=names.map(n=>`<option value="${n.replaceAll('"',"&quot;")}">`).join("");
  }catch(e){console.warn(e)}
}

async function isAdmin(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return false;
  const {data,error}=await sb.from("trainer_access")
    .select("role,active,deleted_at,auth_user_id")
    .eq("auth_user_id",session.user.id)
    .is("deleted_at",null)
    .maybeSingle();
  if(error)throw error;
  return !!(data&&data.role==="admin"&&data.active===true);
}

async function boot(){
  try{
    const ok=await isAdmin();
    $("#gate").classList.toggle("hidden",ok);
    $("#app").classList.toggle("hidden",!ok);
    $("#logout").classList.toggle("hidden",!ok);
    if(ok){
      status("");
      await trainerNames();
      await load();
    }
  }catch(e){
    console.error(e);
    status(`Erreur: ${e.message}`,true);
  }
}

async function login(){
  const email=$("#email").value.trim();
  const password=$("#password").value;
  if(!email||!password){status("E-mail et mot de passe obligatoires.",true);return}
  const btn=$("#login");
  btn.disabled=true;
  status("Connexion…");
  try{
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;
    const admin=await isAdmin();
    if(!admin){
      await sb.auth.signOut();
      throw Error("Ce compte n’a pas les droits administrateur.");
    }
    await boot();
  }catch(e){
    console.error(e);
    status(e.message||"Connexion impossible.",true);
  }finally{
    btn.disabled=false;
  }
}

async function createAccess(){
  let role=$("#role").value,email=$("#trainerEmail").value.trim().toLowerCase(),name=$("#trainer").value.trim();
  if(!email)return $("#createStatus").textContent="E-mail obligatoire.";
  if(role==="trainer"){
    name=names.find(n=>norm(n)===norm(name));
    if(!name)return $("#createStatus").textContent="Choisissez un formateur du catalogue.";
  }else name=null;
  try{
    const b=await fn("authorize",{email,trainer_name:name,role});
    $("#createStatus").innerHTML=`Accès prêt. Code: <span class="code">${b.code}</span> (à transmettre au formateur)`;
    $("#trainer").value="";
    $("#trainerEmail").value="";
    await load();
  }catch(e){$("#createStatus").textContent=e.message}
}

function render(){
  const q=$("#search").value.trim().toLowerCase();
  const a=users.filter(u=>!q||String(u.trainer_name||"Administrateur").toLowerCase().includes(q)||u.email.toLowerCase().includes(q));
  $("#count").textContent=`${users.length} accès`;
  $("#list").innerHTML=a.map(u=>`<div class="row" data-id="${u.id}">
    <div class="who"><strong>${u.trainer_name||"Administrateur UniPop Go"}</strong><span>${u.email}</span>
    <div class="badges"><span class="badge ${u.active?"ok":"blocked"}">${u.active?"Actif":"Bloqué"}</span><span class="badge">${u.role}</span>${u.activation_code?`<span class="badge">Code en attente</span>`:""}</div></div>
    <div class="actions">${u.activation_code?`<button data-a="copy">Copier code</button>`:""}<button data-a="reset">Nouveau code</button><button data-a="toggle">${u.active?"Bloquer":"Réactiver"}</button><button class="danger" data-a="delete">Supprimer</button></div>
  </div>`).join("");
  document.querySelectorAll(".row button").forEach(b=>b.addEventListener("click",()=>act(b.closest(".row").dataset.id,b.dataset.a)));
}

async function load(){
  const {data,error}=await sb.from("trainer_access")
    .select("id,email,trainer_name,role,active,activation_code,deleted_at,auth_user_id")
    .is("deleted_at",null).order("trainer_name");
  if(error)throw error;
  users=data||[];
  render();
}

async function act(id,a){
  const u=users.find(x=>x.id===id);if(!u)return;
  try{
    const {data:{session}}=await sb.auth.getSession();
    const self=!!(session?.user?.id&&u.auth_user_id===session.user.id);
    if(a==="copy"){await navigator.clipboard.writeText(u.activation_code);alert(`Code copié: ${u.activation_code}`);return}
    if((a==="toggle"||a==="delete")&&self){alert("Le compte administrateur actuellement connecté ne peut pas être bloqué ou supprimé.");return}
    if(a==="reset"){const b=await fn("reset_code",{id});alert(`Nouveau code: ${b.code}`)}
    if(a==="toggle")await fn("set_active",{id,active:!u.active});
    if(a==="delete"&&confirm(`Supprimer l'accès de ${u.trainer_name||u.email} ?`))await fn("archive",{id});
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
    $("#logout").addEventListener("click",async()=>{await sb.auth.signOut();await boot()});
    $("#create").addEventListener("click",createAccess);
    $("#search").addEventListener("input",render);

    await boot();
  }catch(e){
    console.error(e);
    status(`Erreur de démarrage: ${e.message}`,true);
  }
});
