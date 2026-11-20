let state, currentId=null, currentPlayerId=null, currentTeamId=null, scorecardMatchId=null, scorecardInningsIndex=0, undoStack=[], lang='en', saveRevision=0, pendingDelivery=null, installPromptEvent=null, swipeStart=null;
const $=id=>document.getElementById(id), uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2300)}
function renderInstallPanel(){
 const panel=$('installPanel');if(!panel)return;
 const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 panel.classList.toggle('hidden',standalone);
 $('installApp').classList.toggle('hidden',!installPromptEvent||standalone);
 $('installHelp').textContent=installPromptEvent
  ?'Install CRICDAIRY on your phone for an app-like experience and offline scoring.'
  :'On iPhone/iPad, tap Share → Add to Home Screen. On Android, open your browser menu and choose Install app or Add to Home screen.';
}
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();installPromptEvent=event;renderInstallPanel();
});
window.addEventListener('appinstalled',()=>{
 installPromptEvent=null;renderInstallPanel();toast('CRICDAIRY installed');
});
async function installApp(){
 if(!installPromptEvent)return toast('Use your browser menu to add CRICDAIRY to your home screen');
 const promptEvent=installPromptEvent;installPromptEvent=null;renderInstallPanel();
 await promptEvent.prompt();
 const choice=await promptEvent.userChoice;
 if(choice.outcome==='accepted')toast('CRICDAIRY install started');
 renderInstallPanel();
}
function save(){
 const revision=++saveRevision;
 $('saveStatus').textContent='Saving…';
 const saving=Store.save(state).then(ok=>{
  if(revision===saveRevision)$('saveStatus').textContent=ok?'Saved on this device':'Save failed — export a backup';
 });
 renderAll();
 return saving;
}
function page(p,recordHistory=true){
 if(recordHistory&&p==='home'&&history.state?.cricdairyApp&&history.state.screen!=='home')history.back();
 else if(recordHistory&&p!=='home')history.pushState({cricdairyApp:true,screen:p},'',location.href);
 document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===p));
 $('home').classList.toggle('hidden',p!=='home');
 $('appHeader').classList.toggle('hidden',p==='home');
 document.body.classList.toggle('scoring-screen',p==='scorer');
 if(p==='scorer')renderScorer();
 if(p==='playerProfile')renderPlayerProfile();
 if(p==='teamStats')renderTeamStats();
 if(p==='teamProfile')renderTeamProfile();
}
function activeMatch(){return state.matches.find(m=>m.id===currentId)}
function team(id){return state.teams.find(t=>t.id===id)}
function teamTypeLabel(item){return item?.type==='club'?'Club team':'Other team'}
function playersFor(teamId){return state.players.filter(p=>p.teamId===teamId)}
function modeLabel(mode){return ({standard:'Standard',single:'Single wicket',double:'Double wicket',triple:'Triple wicket',custom:'Custom players'})[mode]||'Standard'}
function addTeam(name,type='other'){if(!name.trim())return;state.teams.push({id:uid(),name:name.trim(),type});save()}
function init(){
 state=window.__initialState||null;
 history.replaceState({cricdairyApp:true,screen:'home'},'',location.href);
 window.addEventListener('popstate',()=>{page('home',false);history.replaceState({cricdairyApp:true,screen:'home'},'',location.href)});
 Store.init().then(data=>{state=normalizeState(data||Store.defaults());lang='en';$('matchDate').value=new Date().toISOString().slice(0,10);renderAll();setup();if(!data?.settings?.profileName||data.settings.profileName==='Admin'||data?.settings?.login!==undefined||data?.settings?.password!==undefined||data?.settings?.lang!=='en')Store.save(state).then(ok=>{if(ok)$('saveStatus').textContent='Saved on this device'});if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});});
}
function normalizeState(data){
 const defaults=Store.defaults();
 const normalized={
  teams:Array.isArray(data?.teams)?data.teams:defaults.teams,
  players:(Array.isArray(data?.players)?data.players:defaults.players).map(p=>({...p,photo:typeof p.photo==='string'?p.photo:'',stats:p.stats||{runs:0,balls:0,wickets:0,matches:0}})),
  matches:Array.isArray(data?.matches)?data.matches:defaults.matches,
  tournaments:(Array.isArray(data?.tournaments)?data.tournaments:defaults.tournaments).map(series=>({...series,teamIds:Array.isArray(series.teamIds)?series.teamIds:[]})),
  settings:{...defaults.settings,...(data?.settings||{}),lang:'en'},
  playingDraft:data?.playingDraft||null,
  playingSelection:data?.playingSelection||null
 };
 delete normalized.settings.login;
 delete normalized.settings.password;
 if(!normalized.settings.profileName||normalized.settings.profileName==='Admin')normalized.settings.profileName='RAZI SHAH';
 if(!normalized.settings.profilePhoto)normalized.settings.profilePhoto='./assets/admin-profile.jpg';
 if(!normalized.settings.displayPhoto)normalized.settings.displayPhoto='./assets/app-display.jpg';
 normalized.matches=normalized.matches.map(m=>{
  const teams=Array.isArray(m.teams)?m.teams:['',''];
  const lineups=m.lineups||Object.fromEntries(teams.map(id=>[id,playersFor(id).map(p=>p.id)]));
  const innings=Array.isArray(m.innings)&&m.innings.length?m.innings.map(i=>({
   ...i,
   runs:Number(i.runs)||0,wickets:Number(i.wickets)||0,legal:Number(i.legal)||0,
   balls:Array.isArray(i.balls)?i.balls:[],batters:i.batters||{},bowlers:i.bowlers||{},
   extras:i.extras||{wide:0,noball:0,bye:0,legbye:0,penalty:0},fow:Array.isArray(i.fow)?i.fow:[],
   lineup:Array.isArray(i.lineup)?i.lineup:(lineups[i.batting]||[]),
   wicketLimit:Number(i.wicketLimit)||Math.max(1,(lineups[i.batting]||[]).length-1)
  })):[newInnings(teams[0]||'',teams[1]||'',lineups[teams[0]]||[],m.mode||'standard')];
  return {...m,teams,lineups,mode:m.mode||'standard',seriesId:m.seriesId||'',innings,current:Number.isInteger(m.current)?m.current:0,inningsBreak:Boolean(m.inningsBreak),pendingBowler:Boolean(m.pendingBowler),pendingBatterSlot:['striker','non'].includes(m.pendingBatterSlot)?m.pendingBatterSlot:''};
 });
 return normalized;
}
function setup(){
 document.querySelectorAll('#playerRole option,#matchNewPlayerRole option,#matchPlayerEditRole option').forEach(option=>{
  if(option.value==='Wicketkeeper'){option.setAttribute('value','Wicketkeeper');option.textContent='Wicketkeeper (WK)'}
 });
 $('saveProfile').onclick=saveProfile;
 $('saveDisplayPhoto').onclick=saveDisplayPhoto;
 $('resetDisplayPhoto').onclick=()=>{state.settings.displayPhoto='./assets/app-display.jpg';$('displayPhotoInput').value='';save();toast('Original display picture restored')};
 $('removeProfilePhoto').onclick=()=>{state.settings.profilePhoto='./assets/admin-profile.jpg';$('profilePhotoInput').value='';save();toast('Original profile picture restored')};
 $('menuTeams').onclick=()=>page('teams');
 $('menuPlayerStats').onclick=()=>{page('teams');$('playerStatsPanel').scrollIntoView({behavior:'smooth'})};
 $('menuTeamStats').onclick=()=>page('teamStats');
 $('menuNewMatch').onclick=()=>page('newmatch');
 $('menuResumeMatch').onclick=resumeLatestMatch;
 $('menuLive').onclick=()=>page('live');
 $('menuHistory').onclick=()=>page('history');
 $('menuTournaments').onclick=()=>page('tournaments');
 $('menuReports').onclick=()=>page('reports');
 $('menuSettings').onclick=()=>page('settings');
 $('menuLoadMatch').onclick=()=>page('history');
 document.addEventListener('touchstart',event=>{
  swipeStart=event.touches.length===1&&event.touches[0].clientX<=64?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
 },{passive:true});
 document.addEventListener('touchend',event=>{
  if(!swipeStart||!event.changedTouches.length)return;
  const dx=event.changedTouches[0].clientX-swipeStart.x,dy=event.changedTouches[0].clientY-swipeStart.y;
  swipeStart=null;
  if($('home').classList.contains('hidden')&&dx>=90&&dx>Math.abs(dy)*1.4)page('home');
 },{passive:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('home').classList.contains('hidden'))page('home')});
 $('addTeam').onclick=()=>{const name=$('newTeamName').value.trim();if(!name)return toast('Enter a team name');addTeam(name,$('newTeamType').value);$('newTeamName').value='';renderAll();toast('Team added')};
 $('addQuickTeam').onclick=()=>{page('teams');$('newTeamName').focus();toast('Enter the team name, then select Add')};
 $('addPlayer').onclick=async()=>{const name=$('newPlayerName').value.trim(),teamId=$('playerTeam').value;if(!name||!teamId)return toast('Enter player name and team');const f=$('playerPhoto').files[0];const photo=f&&f.type.startsWith('image/')?await resizeImage(f,320):'';state.players.push({id:uid(),name,teamId,role:$('playerRole').value,photo,stats:{runs:0,balls:0,wickets:0,matches:0}});$('newPlayerName').value='';$('playerPhoto').value='';save();renderAll();toast('Player added')};
 $('addPlayingPlayerA').onclick=()=>addPlayingPlayer('A');
 $('addPlayingPlayerB').onclick=()=>addPlayingPlayer('B');
 $('startMatch').onclick=startMatch;
 $('matchMode').onchange=()=>{updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('teamA').onchange=()=>{updateTossWinnerOptions();updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('teamB').onchange=()=>{updateTossWinnerOptions();updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('matchFormat').onchange=()=>{const format=$('matchFormat').value;const defaults={T5:5,T10:10,T15:15,T20:20,T25:25,T30:30,'ODI 50 Overs':50,Custom:20};if(format!=='Test Match')$('matchOvers').value=defaults[format]||20;updateMatchModeInfo()};
 $('countA').onchange=()=>updatePlayingCount('A');
 $('countB').onchange=()=>updatePlayingCount('B');
 $('confirmPlayers').onclick=savePlayingPlayers;
 document.querySelectorAll('[data-run]').forEach(b=>b.onclick=()=>scoreSelectedRun(+b.dataset.run));
 document.querySelectorAll('[data-extra]').forEach(b=>b.onclick=()=>extra(b.dataset.extra));
 $('wicketBtn').onclick=openWicketPanel;
 $('recordWicket').onclick=recordWicket;$('cancelWicket').onclick=closeWicketPanel;
 $('confirmNextBowler').onclick=confirmNextBowler;$('confirmNextBatter').onclick=confirmNextBatter;
 $('dismissal').onchange=()=>{$('fielder').value='';updateWicketFielderControls()};
 $('deliveryDismissal').onchange=()=>{$('deliveryFielder').value='';updateDeliveryOutControls()};
 $('recordDelivery').onclick=()=>recordPendingDelivery();
 $('cancelDelivery').onclick=closeDeliveryPanel;
 $('matchPlayerTeam').onchange=()=>renderMatchPlayerControls(activeMatch());
 $('matchPlayerEditSelect').onchange=loadMatchPlayerEditForm;
 $('addMatchPlayer').onclick=addMatchPlayer;
 $('saveMatchPlayerEdit').onclick=saveMatchPlayerEdit;
 $('matchSeries').onchange=()=>{fillTeamSelects();updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('undoBtn').onclick=undo;$('swapBtn').onclick=()=>{const m=activeMatch();if(m&&m.non){[m.striker,m.non]=[m.non,m.striker];save()}};
 $('changeBowler').onclick=()=>{const m=activeMatch();if(!m)return;const v=$('pickBowler').value;if(v){m.bowler=v;save()}};
 $('pickStriker').onchange=e=>{const m=activeMatch();if(m){if(e.target.value&&e.target.value===m.non){toast('Choose a different non-striker');renderScorer();return}m.striker=e.target.value;save()}};
 $('pickNon').onchange=e=>{const m=activeMatch();if(m){if(e.target.value&&e.target.value===m.striker){toast('Choose a different striker');renderScorer();return}m.non=e.target.value;save()}};
 $('pickBowler').onchange=e=>{const m=activeMatch();if(m){m.bowler=e.target.value;save()}};
 $('endInnings').onclick=endInnings;$('startNextInnings').onclick=startNextInnings;$('finishMatch').onclick=finishMatch;$('backLive').onclick=()=>page('live');$('printScore').onclick=()=>window.print();
 $('shareMatch').onclick=shareMatch;
 $('installApp').onclick=installApp;
 $('historySearch').oninput=renderHistory;
 $('playerStatsSearch').oninput=()=>renderPlayerStats();
 $('playerStatsSort').onchange=()=>renderPlayerStats();
 $('playerStatsTeamFilter').onchange=()=>renderPlayerStats();
 $('playerStatsPlayerFilter').onchange=()=>renderPlayerStats();
 $('teamStatsFilter').onchange=renderTeamStats;
 $('addTournament').onclick=()=>{const n=$('tournamentName').value.trim(),teamIds=Array.from(document.querySelectorAll('.tournament-team-choice:checked')).map(input=>input.value);if(!n)return toast('Enter a series name');if(state.tournaments.some(s=>s.name.toLowerCase()===n.toLowerCase()))return toast('A series with this name already exists');if(new Set(teamIds).size<2)return toast('Select at least two teams or clubs for the series');state.tournaments.push({id:uid(),name:n,teamIds});$('tournamentName').value='';save();toast('Series created. Start its matches from this series card.')};
 $('exportJson').onclick=exportJson;$('restoreJson').onchange=restoreJson;$('exportCsv').onclick=exportCsv;
 $('reportPrint').onclick=()=>{const id=$('reportMatch').value;if(id){currentId=id;page('scorer');setTimeout(()=>window.print(),250)}};
 $('demoBtn').onclick=demo;$('clearDemo').onclick=async()=>{if(!confirm('Delete ALL local teams, players and matches? Export a backup first.'))return;state=Store.defaults();currentId=null;undoStack=[];const cleared=await Store.clear();renderAll();$('saveStatus').textContent=cleared?'Local data cleared':'Could not clear all local data';toast(cleared?'Local data cleared':'Could not clear all local data')};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')Store.save(state)});
 window.addEventListener('pagehide',()=>{Store.save(state)});
 if('serviceWorker'in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{});
 updateMatchModeInfo();
 renderPlayingPlayerSelectors();
 renderInstallPanel();
}
function saveProfile(){
 const name=$('profileNameInput').value.trim()||'RAZI SHAH';
 const file=$('profilePhotoInput').files[0];
 const commit=photo=>{state.settings.profileName=name;if(photo!==undefined)state.settings.profilePhoto=photo;save();toast('Profile saved')};
 if(!file){commit(undefined);return}
 if(!file.type.startsWith('image/'))return toast('Please choose an image file');
 const reader=new FileReader();
 reader.onload=()=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const max=480;const scale=Math.min(1,max/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);commit(canvas.toDataURL('image/jpeg',0.82));$('profilePhotoInput').value=''};img.onerror=()=>toast('Could not read this image');img.src=reader.result};
 reader.readAsDataURL(file);
}
function saveDisplayPhoto(){
 const file=$('displayPhotoInput').files[0];if(!file)return toast('Choose a display picture first');if(!file.type.startsWith('image/'))return toast('Please choose an image file');
 const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const max=900;const scale=Math.min(1,max/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);state.settings.displayPhoto=canvas.toDataURL('image/jpeg',0.84);$('displayPhotoInput').value='';save();toast('Display picture saved')};img.onerror=()=>toast('Could not read this image');img.src=reader.result};reader.readAsDataURL(file);
}
function profileMarkup(){
 const photo=state.settings.profilePhoto||'./assets/admin-profile.jpg';
 const display=state.settings.displayPhoto||'./assets/app-display.jpg';
 ['headerDisplayPic','settingsDisplayPreview'].forEach(id=>{const el=$(id);if(el)el.src=display;});
 const name=state.settings.profileName||'RAZI SHAH';
 const initial=(name.trim()[0]||'A').toUpperCase();
 const placeholder='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" fill="#174327"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="76" font-weight="700" fill="#eaffef">${initial}</text></svg>`);
 ['headerProfilePhoto','settingsProfilePreview'].forEach(id=>{const el=$(id);if(!el)return;el.src=photo||placeholder;el.style.display='inline-flex'});
 ['headerProfileName'].forEach(id=>{if($(id))$(id).textContent=name});
 if($('profileNameInput'))$('profileNameInput').value=name;
 if($('settingsDisplayPreview'))$('settingsDisplayPreview').src=display;
}
function fillTeamSelects(){
 const selected={};
 ['teamA','teamB','tossWinner','playerTeam','matchSeries'].forEach(id=>{selected[id]=$(id).value});
 const series=state.tournaments.find(item=>item.id===selected.matchSeries),participantIds=series?.teamIds?.filter(id=>state.teams.some(item=>item.id===id))||[];
 const matchTeams=participantIds.length>=2?state.teams.filter(item=>participantIds.includes(item.id)):state.teams;
 const opts=state.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
 const matchOpts=matchTeams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
 ['teamA','teamB'].forEach(id=>$(id).innerHTML=matchOpts);
 $('tossWinner').innerHTML='<option value="">Select toss winner</option>';
 $('playerTeam').innerHTML=opts;
 $('matchSeries').innerHTML='<option value="">Select series (optional)</option>'+state.tournaments.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
 ['teamA','teamB','playerTeam','matchSeries'].forEach(id=>{
  if(Array.from($(id).options).some(option=>option.value===selected[id]))$(id).value=selected[id];
 });
 const allowed=matchTeams.map(item=>item.id);
 if(!allowed.includes($('teamA').value))$('teamA').value=allowed[0]||'';
 if(!allowed.includes($('teamB').value)||$('teamB').value===$('teamA').value)$('teamB').value=allowed.find(id=>id!==$('teamA').value)||'';
 updateTossWinnerOptions(selected.tossWinner);
}
function updateTossWinnerOptions(preferred=$('tossWinner').value){
 const ids=[$('teamA').value,$('teamB').value].filter(Boolean);
 $('tossWinner').innerHTML='<option value="">Select toss winner</option>'+ids.map(id=>`<option value="${esc(id)}">${esc(team(id)?.name||'Team')}</option>`).join('');
 $('tossWinner').value=ids.includes(preferred)?preferred:'';
}
function updateMatchModeInfo(){
 const mode=$('matchMode').value;
 const teamA=team($('teamA').value),teamB=team($('teamB').value);
 const fixed=mode==='single'?1:mode==='double'?2:mode==='triple'?3:null;
 if(fixed){$('countA').value=fixed;$('countB').value=fixed;$('countA').readOnly=true;$('countB').readOnly=true}
 else{$('countA').readOnly=false;$('countB').readOnly=false}
 const countA=playersFor($('teamA').value).length,countB=playersFor($('teamB').value).length;
 $('matchModeHint').textContent=`${modeLabel(mode)}: select the players who will play. Squads have ${countA} and ${countB} players; each side can select up to 15.`;
}
function selectedPlayingIds(teamKey){
 return Array.from(document.querySelectorAll(`.select-${teamKey}:checked`)).map(input=>input.value);
}
function updatePlayingCounts(){
 $('selectedCountA').textContent=`${selectedPlayingIds('A').length} selected`;
 $('selectedCountB').textContent=`${selectedPlayingIds('B').length} selected`;
}
function setupTeams(){
 return {a:$('teamA').value,b:$('teamB').value,mode:$('matchMode').value};
}
function renderPlayingPlayerSelectors(){
 const setup=setupTeams(),draft=state.playingDraft,confirmed=state.playingSelection;
 const matchesSetup=value=>value&&value.teamA===setup.a&&value.teamB===setup.b&&value.mode===setup.mode;
 const saved=matchesSetup(draft)?draft:matchesSetup(confirmed)?confirmed:null;
 const required=setup.mode==='single'?1:setup.mode==='double'?2:setup.mode==='triple'?3:null;
 const rosterA=playersFor(setup.a),rosterB=playersFor(setup.b);
 const countA=Math.min(15,Math.max(1,required||Number(saved?.countA)||Math.min(11,rosterA.length||1)));
 const countB=Math.min(15,Math.max(1,required||Number(saved?.countB)||Math.min(11,rosterB.length||1)));
 $('countA').value=countA;$('countB').value=countB;
 $('playingTeamAName').textContent=team(setup.a)?.name||'Team A';
 $('playingTeamBName').textContent=team(setup.b)?.name||'Team B';
 const selectedA=Array.isArray(saved?.playersA)?saved.playersA:rosterA.slice(0,countA).map(p=>p.id);
 const selectedB=Array.isArray(saved?.playersB)?saved.playersB:rosterB.slice(0,countB).map(p=>p.id);
 $('playersA').innerHTML=rosterA.length?rosterA.map(p=>`<label class="player-option"><input type="checkbox" class="select-A" value="${esc(p.id)}" ${selectedA.includes(p.id)?'checked':''}>${esc(p.name)}${p.role==='Wicketkeeper'?' <small class="wk-badge">WK</small>':''}</label>`).join(''):'<p class="muted">Add players to this team first.</p>';
 $('playersB').innerHTML=rosterB.length?rosterB.map(p=>`<label class="player-option"><input type="checkbox" class="select-B" value="${esc(p.id)}" ${selectedB.includes(p.id)?'checked':''}>${esc(p.name)}${p.role==='Wicketkeeper'?' <small class="wk-badge">WK</small>':''}</label>`).join(''):'<p class="muted">Add players to this team first.</p>';
 document.querySelectorAll('.select-A,.select-B').forEach(input=>input.onchange=persistPlayingDraft);
 updatePlayingCounts();
 $('selectionMessage').textContent=matchesSetup(confirmed)?'Playing players confirmed.':'Select the required players for both teams, then confirm.';
}
function addPlayingPlayer(teamKey){
 const teamId=$(`team${teamKey}`).value,name=$(`newPlayingPlayer${teamKey}`).value.trim();
 if(!teamId||!name)return toast('Select a team and enter the player name');
 if(playersFor(teamId).some(p=>p.name.trim().toLowerCase()===name.toLowerCase()))return toast('This player is already in the team; select them from the list.');
 const player={id:uid(),name,teamId,role:'Batter',photo:'',stats:{runs:0,balls:0,wickets:0,matches:0}};
 state.players.push(player);
 const setup=setupTeams(),playersA=selectedPlayingIds('A'),playersB=selectedPlayingIds('B');
 const teamPlayers=teamKey==='A'?playersA:playersB,count=Number($(`count${teamKey}`).value);
 const selected=teamPlayers.length<count;
 if(selected)teamPlayers.push(player.id);
 state.playingSelection=null;
 state.playingDraft={teamA:setup.a,teamB:setup.b,mode:setup.mode,countA:Number($('countA').value),countB:Number($('countB').value),playersA,playersB};
 $(`newPlayingPlayer${teamKey}`).value='';
 save();
 toast(selected?'Player added to the team and selected for the lineup.':'Player added to the team. Select them in the lineup; uncheck someone first if it is full.');
}
function updatePlayingCount(teamKey){
 const input=$(`count${teamKey}`);
 const count=Number(input.value),roster=playersFor($(`team${teamKey}`).value);
 if(!Number.isInteger(count)||count<1||count>15||count>roster.length){toast(`Choose 1 to ${Math.min(15,roster.length)} players for Team ${teamKey}`);input.value=Math.max(1,Math.min(15,roster.length||1));return}
 if(teamKey==='A'||teamKey==='B'){
  const boxes=Array.from(document.querySelectorAll(`.select-${teamKey}`));
  const checked=boxes.filter(box=>box.checked);
  if(checked.length>count)checked.slice(count).forEach(box=>box.checked=false);
  else boxes.filter(box=>!box.checked).slice(0,count-checked.length).forEach(box=>box.checked=true);
 }
 persistPlayingDraft();
}
function persistPlayingDraft(){
 const setup=setupTeams(),playersA=selectedPlayingIds('A'),playersB=selectedPlayingIds('B');
 updatePlayingCounts();
 state.playingSelection=null;
 state.playingDraft={teamA:setup.a,teamB:setup.b,mode:setup.mode,countA:Number($('countA').value),countB:Number($('countB').value),playersA,playersB};
 $('selectionMessage').textContent='Player selection changed. Confirm players before starting the match.';
 const revision=++saveRevision;$('saveStatus').textContent='Saving…';
 Store.save(state).then(ok=>{if(revision===saveRevision)$('saveStatus').textContent=ok?'Saved on this device':'Save failed — export a backup'});
}
function savePlayingPlayers(){
 const setup=setupTeams(),countA=Number($('countA').value),countB=Number($('countB').value);
 const playersA=selectedPlayingIds('A'),playersB=selectedPlayingIds('B');
 const availableA=playersFor(setup.a).length,availableB=playersFor(setup.b).length;
 if(!setup.a||!setup.b||setup.a===setup.b)return toast('Select two different teams first');
 if(!Number.isInteger(countA)||countA<1||countA>15||countA>availableA||!Number.isInteger(countB)||countB<1||countB>15||countB>availableB)return toast('Each team count must be between 1 and its available squad size (maximum 15).');
 const required=setup.mode==='single'?1:setup.mode==='double'?2:setup.mode==='triple'?3:null;
 if(required&&(countA!==required||countB!==required))return toast(`${modeLabel(setup.mode)} needs exactly ${required} player${required===1?'':'s'} per side.`);
 if(playersA.length!==countA||playersB.length!==countB)return toast('Select exactly the number of players shown for both teams.');
 state.playingSelection={teamA:setup.a,teamB:setup.b,mode:setup.mode,countA,countB,playersA,playersB};
 state.playingDraft=state.playingSelection;
 const revision=++saveRevision;$('saveStatus').textContent='Saving…';
 Store.save(state).then(ok=>{if(revision===saveRevision)$('saveStatus').textContent=ok?'Saved on this device':'Save failed — export a backup'});
 $('selectionMessage').textContent='Players successfully selected!';
 toast('Playing players confirmed!');
}
function matchLineup(m,teamId){
 if(Array.isArray(m.lineups?.[teamId]))return [...m.lineups[teamId]];
 const inningsLineup=m.innings.find(inn=>inn.batting===teamId&&Array.isArray(inn.lineup)&&inn.lineup.length);
 return inningsLineup?[...inningsLineup.lineup]:playersFor(teamId).map(p=>p.id);
}
function matchPlayerHasParticipated(m,playerId){
 return m.innings.some(inn=>Boolean(inn.batters?.[playerId]||inn.bowlers?.[playerId])||(inn.balls||[]).some(ball=>ball.batterId===playerId||ball.bowlerId===playerId||ball.fielderId===playerId));
}
function renderMatchPlayerControls(m){
 const panel=$('matchPlayerPanel');
 panel.classList.toggle('hidden',!m||m.status!=='live');
 if(!m||m.status!=='live')return;
 const teamSelect=$('matchPlayerTeam'),selectedTeam=teamSelect.value,selectedEdit=$('matchPlayerEditSelect').value;
 teamSelect.innerHTML=m.teams.map(id=>`<option value="${esc(id)}">${esc(team(id)?.name||'Team')}</option>`).join('');
 const defaultTeam=getInnings(m).batting;
 teamSelect.value=m.teams.includes(selectedTeam)?selectedTeam:defaultTeam;
 const teamId=teamSelect.value,lineup=matchLineup(m,teamId);
 const selectedReplace=$('matchPlayerReplace').value,selectedExisting=$('matchExistingPlayer').value;
 const replaceable=lineup.filter(id=>!matchPlayerHasParticipated(m,id));
 const bench=playersFor(teamId).filter(p=>!lineup.includes(p.id));
 $('matchPlayerReplace').innerHTML='<option value="">Choose player to replace</option>'+replaceable.map(id=>`<option value="${esc(id)}">${esc(playerName(id))}</option>`).join('');
 $('matchExistingPlayer').innerHTML='<option value="">Type a new player name instead</option>'+bench.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 const editPlayers=playersFor(teamId);
 $('matchPlayerEditSelect').innerHTML='<option value="">Select player</option>'+editPlayers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 if(replaceable.includes(selectedReplace))$('matchPlayerReplace').value=selectedReplace;
 if(bench.some(p=>p.id===selectedExisting))$('matchExistingPlayer').value=selectedExisting;
 if(editPlayers.some(p=>p.id===selectedEdit))$('matchPlayerEditSelect').value=selectedEdit;
 else $('matchPlayerEditSelect').value=editPlayers[0]?.id||'';
 if(selectedEdit!==$('matchPlayerEditSelect').value)loadMatchPlayerEditForm();
 $('addMatchPlayer').disabled=replaceable.length===0;
 $('saveMatchPlayerEdit').disabled=!$('matchPlayerEditSelect').value;
}
function loadMatchPlayerEditForm(){
 const player=state.players.find(item=>item.id===$('matchPlayerEditSelect').value);
 $('matchPlayerEditName').value=player?.name||'';
 $('matchPlayerEditRole').value=player?.role||'All-rounder';
 $('saveMatchPlayerEdit').disabled=!player;
}
function saveMatchPlayerEdit(){
 const m=activeMatch(),teamId=$('matchPlayerTeam').value,player=state.players.find(item=>item.id===$('matchPlayerEditSelect').value&&item.teamId===teamId),name=$('matchPlayerEditName').value.trim();
 if(!m||m.status!=='live')return toast('There is no live match to update');
 if(!player)return toast('Select a player from the chosen match team');
 if(!name)return toast('Enter a player name');
 player.name=name;player.role=$('matchPlayerEditRole').value;
 save();renderScorer();toast('Player profile updated; match statistics are unchanged.');
}
function addMatchPlayer(){
 const m=activeMatch();
 if(!m||m.status!=='live')return toast('There is no live match to update');
 const teamId=$('matchPlayerTeam').value,replaceId=$('matchPlayerReplace').value,existingId=$('matchExistingPlayer').value,name=$('matchNewPlayerName').value.trim();
 if(!m.teams.includes(teamId))return toast('Select a team in this match');
 if(!replaceId)return toast('Choose a player who has not entered the match to replace');
 if(existingId&&name)return toast('Select an existing player or type a new name, not both');
 const lineup=matchLineup(m,teamId),replaceIndex=lineup.indexOf(replaceId);
 if(replaceIndex<0||matchPlayerHasParticipated(m,replaceId))return toast('Choose an unused player from the selected team to replace');
 let player;
 if(existingId){
  player=state.players.find(p=>p.id===existingId&&p.teamId===teamId);
  if(!player||lineup.includes(existingId))return toast('That player is already in this match lineup');
 }else{
  if(!name)return toast('Select a squad player or enter a new player name');
  player=playersFor(teamId).find(p=>p.name.trim().toLowerCase()===name.toLowerCase());
  if(player&&lineup.includes(player.id))return toast('That player is already in this match lineup');
  if(!player){
   player={id:uid(),name,teamId,role:$('matchNewPlayerRole').value,photo:'',stats:{runs:0,balls:0,wickets:0,matches:0}};
   state.players.push(player);
  }
 }
 lineup[replaceIndex]=player.id;
 m.lineups=m.lineups||{};
 m.lineups[teamId]=lineup;
 if(m.striker===replaceId)m.striker=player.id;
 if(m.non===replaceId)m.non=player.id;
 if(m.bowler===replaceId)m.bowler=player.id;
 const currentInnings=getInnings(m);
 if(currentInnings.batting===teamId){
  const inningsLineup=Array.isArray(currentInnings.lineup)?currentInnings.lineup:[];
  const inningsIndex=inningsLineup.indexOf(replaceId);
  if(inningsIndex>=0)inningsLineup[inningsIndex]=player.id;
  else currentInnings.lineup=lineup.slice();
 }
 $('matchNewPlayerName').value='';$('matchExistingPlayer').value='';
 save();renderScorer();toast(`${player.name} replaced ${playerName(replaceId)} in ${team(teamId)?.name||'the team'}'s lineup.`);
}
function startMatch(){
 const a=$('teamA').value,b=$('teamB').value;if(!a||!b||a===b)return toast('Create/select two different teams');
 const mode=$('matchMode').value,matchFormat=$('matchFormat').value;
 const selection=state.playingSelection;
 if(!selection||selection.teamA!==a||selection.teamB!==b||selection.mode!==mode)return toast('Confirm the playing players for these teams first');
 const required=mode==='single'?1:mode==='double'?2:mode==='triple'?3:null;
 const availableA=playersFor(a),availableB=playersFor(b);
 const lineupA=selection.playersA,lineupB=selection.playersB;
 if(!Array.isArray(lineupA)||!Array.isArray(lineupB)||!lineupA.length||!lineupB.length||lineupA.length>15||lineupB.length>15||lineupA.length!==selection.countA||lineupB.length!==selection.countB||new Set(lineupA).size!==lineupA.length||new Set(lineupB).size!==lineupB.length||lineupA.some(id=>!availableA.some(p=>p.id===id))||lineupB.some(id=>!availableB.some(p=>p.id===id)))return toast('Some selected players are no longer valid. Confirm the lineups again.');
 if(required&&(lineupA.length!==required||lineupB.length!==required))return toast(`${modeLabel(mode)} requires exactly ${required} player${required===1?'':'s'} per side.`);
 const overs=matchFormat==='Test Match'?null:Number($('matchOvers').value);
 if(overs!==null&&(!Number.isInteger(overs)||overs<1||overs>100))return toast('Overs must be a whole number between 1 and 100');
 const winner=$('tossWinner').value||a, batFirst=$('tossDecision').value==='bat'?winner:(winner===a?b:a);
 const lineups={[a]:lineupA,[b]:lineupB},firstLineup=lineups[batFirst];
 const first=newInnings(batFirst,batFirst===a?b:a,firstLineup,mode);
 const m={id:uid(),title:$('matchTitle').value.trim()||`${team(a).name} vs ${team(b).name}`,format:matchFormat,mode,overs,venue:$('matchVenue').value.trim(),date:$('matchDate').value,teams:[a,b],lineups,seriesId:$('matchSeries').value,toss:{winner,decision:$('tossDecision').value},innings:[first],current:0,status:'live',created:Date.now(),superOver:false,striker:firstLineup[0]||null,non:firstLineup[1]||null,bowler:null,pendingBowler:false,pendingBatterSlot:''};
 state.matches.unshift(m);currentId=m.id;undoStack=[];save();page('scorer');toast('Match started');
}
function newInnings(bat,bowl,lineup=[],mode='standard'){return {batting:bat,bowling:bowl,lineup:[...lineup],wicketLimit:mode==='standard'?Math.max(1,lineup.length-1):lineup.length,runs:0,wickets:0,legal:0,balls:[],batters:{},bowlers:{},extras:{wide:0,noball:0,bye:0,legbye:0,penalty:0},fow:[],partnership:0}}
function getInnings(m){return m.innings[m.current]}
function batter(inn,id){if(!inn.batters[id])inn.batters[id]={runs:0,balls:0,fours:0,sixes:0,out:false,dismissal:''};return inn.batters[id]}
function bowler(inn,id){if(!inn.bowlers[id])inn.bowlers[id]={legal:0,runs:0,wickets:0,maidens:0,wides:0,noballs:0};return inn.bowlers[id]}
function snapshot(m){undoStack.push(JSON.stringify(m));if(undoStack.length>40)undoStack.shift()}
function needsFielder(kind){return ['Caught','Stumped','Run Out'].includes(kind)}
function fillFielderSelect(id,m,selected=''){
 const inn=getInnings(m),lineup=m.lineups?.[inn.bowling]||playersFor(inn.bowling).map(p=>p.id);
 $(id).innerHTML='<option value="">Select fielder</option>'+lineup.map(playerId=>state.players.find(p=>p.id===playerId)).filter(Boolean).map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
}
function updateWicketFielderControls(){
 const kind=$('dismissal').value,m=activeMatch(),show=needsFielder(kind);
 $('fielderWrap').classList.toggle('hidden',!show);
 if(show&&m)fillFielderSelect('fielder',m,$('fielder').value);
}
function openWicketPanel(){
 const m=activeMatch();if(!m||m.status!=='live'||m.inningsBreak)return;
 closeDeliveryPanel();
 $('dismissal').value='Bowled';$('outBatter').value='striker';$('fielder').value='';
 updateWicketFielderControls();$('wicketPanel').classList.remove('hidden');
}
function closeWicketPanel(){$('wicketPanel').classList.add('hidden')}
function recordWicket(){
 const m=activeMatch();if(!m||m.status!=='live'||m.inningsBreak)return closeWicketPanel();
 if(!m.striker||!m.bowler)return toast('Select striker and bowler first');
 const kind=$('dismissal').value,fielderId=$('fielder').value;
 if(needsFielder(kind)&&!fielderId)return toast('Select the fielder to record this fielding stat');
 const outChoice=$('outBatter').value;
 closeWicketPanel();wicket(kind,outChoice,fielderId);
}
async function addBall(runs,type='run',extraRuns=0,legal=true,wicketKind=null,outChoice='striker',fielderId=null,forceStrikeChange=false){
 const m=activeMatch();if(!m||m.status!=='live'||m.inningsBreak)return;
 const inn=getInnings(m);
 if(m.pendingBowler)return toast('Select the next bowler before continuing');
 if(m.pendingBatterSlot)return toast('Select the incoming batter before continuing');
 if(type!=='penalty'&&(!m.striker||!m.bowler))return toast('Select striker and bowler first');
 if(wicketKind&&!m.striker)return toast('Select a striker first');
 snapshot(m);
 const strikerId=m.striker,nonId=m.non,outId=wicketKind?(outChoice==='non'&&nonId?nonId:strikerId):null;
 const bat=type==='penalty'?null:batter(inn,strikerId),bw=type==='penalty'?null:bowler(inn,m.bowler);
 let total=runs+extraRuns;
 if(type==='run'){bat.runs+=runs;bat.balls++;if(runs===4)bat.fours++;if(runs===6)bat.sixes++}
 else if(type==='wide'){total=extraRuns+runs;inn.extras.wide+=total;bw.wides++}
 else if(type==='noball'){total=runs+extraRuns;inn.extras.noball+=extraRuns;bat.balls++;bat.runs+=runs;if(runs===4)bat.fours++;if(runs===6)bat.sixes++;bw.noballs++}
 else if(type==='bye'||type==='legbye'){total=runs;inn.extras[type]+=runs;bat.balls++}
 else if(type==='penalty'){total=extraRuns;inn.extras.penalty+=extraRuns}
 inn.runs+=total;inn.partnership+=total;
 if(bw)bw.runs+=type==='bye'||type==='legbye'?0:total;
 if(legal){inn.legal++;if(bw)bw.legal++}
 if(type!=='penalty'&&m.non&&(runs%2===1||forceStrikeChange))[m.striker,m.non]=[m.non,m.striker];
 if(wicketKind){
  const dismissed=batter(inn,outId);dismissed.out=true;dismissed.dismissal=wicketKind;inn.wickets++;
  if(bw&&!['Run Out','Retired Out','Obstructing the Field','Hit Ball Twice'].includes(wicketKind))bw.wickets++;
  inn.fow.push({w:inn.wickets,r:inn.runs,overs:`${Math.floor(inn.legal/6)}.${inn.legal%6}`,player:outId});inn.partnership=0;
  const incoming=inn.lineup.find(id=>!inn.batters[id]?.out&&id!==m.striker&&id!==m.non);
  if(outId===m.striker){m.striker=incoming||m.non||null;if(m.striker===m.non)m.non=null;m.pendingBatterSlot=incoming?'striker':''}
  else if(outId===m.non){m.non=incoming||null;m.pendingBatterSlot=incoming?'non':''}
 }
 if(m.non&&legal&&inn.legal%6===0){
  [m.striker,m.non]=[m.non,m.striker];
  if(m.pendingBatterSlot)m.pendingBatterSlot=m.pendingBatterSlot==='striker'?'non':'striker';
 }
 let text=ballText(runs,type,total);if(wicketKind)text+=' W';
 inn.balls.push({runs,total,type,legal,wicket:wicketKind||'',changeStrike:Boolean(forceStrikeChange),over:Math.floor((inn.legal-(legal?1:0))/6),text,batterId:type==='penalty'?null:strikerId,bowlerId:bw?m.bowler:null,fielderId:wicketKind&&needsFielder(wicketKind)?fielderId||null:null});
 if(wicketKind&&needsFielder(wicketKind))$('fielder').value='';
 if(m.current>0&&inn.runs>=m.innings[0].runs+1){completeMatchState(m);toast(m.result)}
 else{
  const maxOvers=Number(m.overs),oversComplete=Number.isFinite(maxOvers)&&maxOvers>0&&inn.legal>=maxOvers*6;
  if(inn.wickets>=inn.wicketLimit||oversComplete){await endInnings(false);return}
  if(wicketKind)toast('Wicket recorded');
  if(legal&&inn.legal>0&&inn.legal%6===0){
   m.pendingBowler=true;m.previousOverBowler=m.bowler||'';m.bowler=null;
  }
 }
 await save();renderScorer();
}
function ballText(r,t,total){if(t==='run')return r===0?'•':String(r);if(t==='wide')return `Wd${total>1?total:''}`;if(t==='noball')return `Nb${total>1?total:''}`;if(t==='bye')return `B${total}`;if(t==='legbye')return `Lb${total}`;return `P${total}`}
function deliver(r){addBall(r,'run',0,true)}
function scoreSelectedRun(runs){
 if(pendingDelivery){recordPendingDelivery(runs);return}
 deliver(runs);
}
function extra(type){
 const m=activeMatch();if(!m||m.status!=='live'||m.inningsBreak)return;
 closeWicketPanel();
 if(type==='penalty'){closeDeliveryPanel();$('deliveryChangeStrike').checked=false;addBall(0,'penalty',5,false);return}
 if(!['wide','noball','bye','legbye'].includes(type))return toast('Unknown extra type');
 closeDeliveryPanel();
 pendingDelivery=type;
 document.querySelectorAll('[data-extra]').forEach(button=>button.classList.toggle('selected-extra',button.dataset.extra===type));
 $('deliveryChangeStrike').checked=false;
}
function updateDeliveryOutControls(){
 const kind=$('deliveryDismissal').value,m=activeMatch();
 $('deliveryOutWrap').classList.toggle('hidden',!kind);
 const showFielder=needsFielder(kind);
 $('deliveryFielderWrap').classList.toggle('hidden',!showFielder);
 if(showFielder&&m)fillFielderSelect('deliveryFielder',m,$('deliveryFielder').value);
 if(!kind||!m)return;
 const options=[['striker',playerName(m.striker)]];
 if(m.non)options.push(['non',playerName(m.non)]);
 $('deliveryOut').innerHTML=options.map(([value,name])=>`<option value="${value}">${esc(name)} out</option>`).join('');
}
function closeDeliveryPanel(){pendingDelivery=null;$('deliveryPanel').classList.add('hidden');document.querySelectorAll('[data-extra]').forEach(button=>button.classList.remove('selected-extra'))}
function recordPendingDelivery(selectedRuns){
 if(!pendingDelivery)return;
 const m=activeMatch(),type=pendingDelivery,runs=Number(selectedRuns),extras={wide:1,noball:1,bye:0,legbye:0};
 if(!m||m.status!=='live'||m.inningsBreak)return closeDeliveryPanel();
 if(!m.striker||!m.bowler)return toast('Select striker and bowler first');
 closeDeliveryPanel();addBall(runs,type,extras[type],!['wide','noball'].includes(type));
}
function wicket(kind,outChoice='striker',fielderId=null){addBall(0,'run',0,true,kind,outChoice,fielderId)}
function applyPlayerOfTheMatch(m){
 const performance=new Map();
 (m.innings||[]).forEach(inn=>{
  Object.entries(inn.batters||{}).forEach(([id,stats])=>{
   const item=performance.get(id)||{id,runs:0,wickets:0};
   item.runs+=Number(stats.runs)||0;performance.set(id,item);
  });
  Object.entries(inn.bowlers||{}).forEach(([id,stats])=>{
   const item=performance.get(id)||{id,runs:0,wickets:0};
   item.wickets+=Number(stats.wickets)||0;performance.set(id,item);
  });
 });
 const best=[...performance.values()].filter(item=>item.runs||item.wickets)
  .sort((a,b)=>(b.runs+b.wickets*20)-(a.runs+a.wickets*20)||b.runs-a.runs||b.wickets-a.wickets)[0];
 m.playerOfTheMatch=best?.id||null;
}
function completeMatchState(m){
 m.status='completed';m.inningsBreak=false;m.pendingBowler=false;m.pendingBatterSlot='';m.previousOverBowler='';m.result=matchResult(m);applyPlayerOfTheMatch(m);closeDeliveryPanel();closeWicketPanel();
}
function undo(){const m=activeMatch();if(!m||!undoStack.length)return toast('Nothing to undo');const prev=JSON.parse(undoStack.pop());Object.assign(m,prev);save();renderScorer();toast('Last action undone')}
async function endInnings(ask=true){
 const m=activeMatch();if(!m||m.status!=='live'||m.inningsBreak)return;const inn=getInnings(m);if(ask&&!confirm('End this innings?'))return;
 if(m.current===0){
  m.inningsBreak=true;m.pendingBowler=false;m.pendingBatterSlot='';m.previousOverBowler='';closeDeliveryPanel();closeWicketPanel();toast('Innings ended. Start the next innings when ready.');
 }else{completeMatchState(m);toast('Match completed')}
 await save();renderScorer();
}
function startNextInnings(){
 const m=activeMatch();if(!m||m.status!=='live'||!m.inningsBreak||m.current!==0)return;
 const first=m.innings[0],lineup=m.lineups?.[first.bowling]||playersFor(first.bowling).map(p=>p.id);
 m.innings.push(newInnings(first.bowling,first.batting,lineup,m.mode));m.current=1;m.inningsBreak=false;m.pendingBowler=false;m.pendingBatterSlot='';m.previousOverBowler='';
 scorecardInningsIndex=1;
 m.striker=lineup[0]||null;m.non=lineup[1]||null;m.bowler=null;save();renderScorer();toast('Second innings started. Select a bowler.');
}
function matchResult(m){
 const first=m.innings[0],second=m.innings[1];
 if(!second)return 'Result pending';
 if(second.runs===first.runs)return 'Match tied';
 return second.runs>first.runs?`${team(second.batting)?.name||'Team'} won by ${Math.max(0,second.wicketLimit-second.wickets)} wicket${second.wicketLimit-second.wickets===1?'':'s'}`:`${team(first.batting)?.name||'Team'} won by ${first.runs-second.runs} run${first.runs-second.runs===1?'':'s'}`;
}
function winningPrediction(m,inn){
 const [teamA,teamB]=m.teams;
 if(m.status==='completed'){
  const first=m.innings[0],second=m.innings[1];
  if(!second||first.runs===second.runs)return {a:50,b:50,message:second?'Match tied':'Result pending'};
  const winner=second.runs>first.runs?second.batting:first.batting;
  return {a:winner===teamA?100:0,b:winner===teamB?100:0,message:`${team(winner)?.name||'Team'} won`};
 }
 const totalOvers=Number(m.overs);
 if(!Number.isFinite(totalOvers)||totalOvers<=0)return {a:50,b:50,message:'Unavailable for this format'};
 const baselineRate=totalOvers>=40?6.2:totalOvers<=10?8.5:7.5;
 let battingChance;
 if(m.current===0){
  const progress=inn.legal/6,par=baselineRate*totalOvers;
  const projected=m.inningsBreak?inn.runs:((inn.runs+baselineRate*2)/(progress+2))*totalOvers;
  const wicketLimit=Math.max(1,inn.wicketLimit||10),wicketsLeft=Math.max(0,wicketLimit-inn.wickets);
  const margin=(projected-par)/Math.max(1,par*.18)+(wicketsLeft/wicketLimit-1)*.65;
  battingChance=1/(1+Math.exp(-Math.max(-4,Math.min(4,margin))));
 }else{
  const first=m.innings[0],needed=first.runs+1-inn.runs,ballsLeft=Math.max(0,totalOvers*6-inn.legal);
  const wicketLimit=Math.max(1,inn.wicketLimit||10),wicketsLeft=Math.max(0,wicketLimit-inn.wickets);
  if(needed<=0)battingChance=1;
  else if(!ballsLeft||!wicketsLeft)battingChance=0;
  else{
   const requiredRate=needed/(ballsLeft/6),wicketFactor=(wicketsLeft/wicketLimit-.5)*1.15,timeFactor=(ballsLeft/(totalOvers*6)-.5)*.25;
   const margin=2.4*(baselineRate-requiredRate)/baselineRate+wicketFactor+timeFactor;
   battingChance=1/(1+Math.exp(-Math.max(-4,Math.min(4,margin))));
  }
 }
 battingChance=Math.max(.02,Math.min(.98,battingChance));
 const battingTeam=inn.batting;
 return {a:battingTeam===teamA?battingChance:1-battingChance,b:battingTeam===teamB?battingChance:1-battingChance,message:''};
}
function renderWinningPrediction(m,inn){
 const prediction=winningPrediction(m,inn),aPercent=Math.round(prediction.a*100),bPercent=100-aPercent;
 const nameA=team(m.teams[0])?.name||'Team A',nameB=team(m.teams[1])?.name||'Team B';
 const favored=aPercent===50?null:aPercent>bPercent?nameA:nameB,favoredPercent=Math.max(aPercent,bPercent);
 $('winPredictionHeadline').textContent=prediction.message||(favored?`${favored} favored (${favoredPercent}%)`:'Too close to call');
 $('winPredictionTeams').textContent=`${nameA} ${aPercent}% • ${nameB} ${bPercent}%`;
 $('winPredictionA').style.flexBasis=`${aPercent}%`;$('winPredictionB').style.flexBasis=`${bPercent}%`;
 document.querySelector('.prediction-meter').setAttribute('aria-valuenow',String(aPercent));
}
function renderLiveScoringSummary(m,inn){
 const recent=(inn.balls||[]).slice(-6);
 $('recentBalls').innerHTML=recent.map(ball=>`<span class="recent-ball ${ball.wicket?'wicket':''}">${esc(ball.text||'•')}</span>`).join('')||'<span class="recent-ball empty-ball">—</span>';
 const batterIds=[m.striker,m.non,...Object.keys(inn.batters||{})].filter((id,index,all)=>id&&all.indexOf(id)===index);
 const battingRows=batterIds.map(id=>{
  const stats=inn.batters[id]||{runs:0,balls:0,fours:0,sixes:0,out:false,dismissal:''},active=id===m.striker||id===m.non;
  return `<tr${active?' class="current-batter"':''}><td>${esc(playerName(id))}${active?' *':''}</td><td>${stats.runs||0}</td><td>${stats.balls||0}</td><td>${stats.fours||0}</td><td>${stats.sixes||0}</td><td>${stats.balls?(stats.runs/stats.balls*100).toFixed(1):'0.0'}</td><td>${esc(stats.dismissal||'not out')}</td></tr>`;
 }).join('');
 $('liveBattingTable').innerHTML=`<table><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th><th>Status</th></tr></thead><tbody>${battingRows||'<tr><td colspan="7">No batting data yet</td></tr>'}</tbody></table>`;
 const bowlerIds=[m.bowler,...Object.keys(inn.bowlers||{})].filter((id,index,all)=>id&&all.indexOf(id)===index);
 const bowlingRows=bowlerIds.map(id=>{
  const stats=inn.bowlers[id]||{legal:0,maidens:0,runs:0,wickets:0,wides:0,noballs:0};
  const figures=bowlingFigures(stats);
  const dots=(inn.balls||[]).filter(ball=>ball.bowlerId===id&&ball.legal&&Number(ball.total)===0).length;
  return `<tr><td>${esc(playerName(id))}${id===m.bowler?' *':''}</td><td>${figures.overs}</td><td>${stats.maidens||0}</td><td>${stats.runs||0}</td><td>${stats.wickets||0}</td><td>${figures.average}</td><td>${figures.economy}</td><td>${figures.strike}</td><td>${dots}</td><td>${stats.wides||0}</td><td>${stats.noballs||0}</td></tr>`;
 }).join('');
 $('liveBowlingTable').innerHTML=`<table><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Avg</th><th>Econ</th><th>SR</th><th>D</th><th>WD</th><th>NB</th></tr></thead><tbody>${bowlingRows||'<tr><td colspan="11">No bowling data yet</td></tr>'}</tbody></table>`;
}
function renderNextPlayerPrompts(m,inn){
 const batterPending=Boolean(m.pendingBatterSlot),bowlerPending=Boolean(m.pendingBowler);
 $('nextBatterPrompt').classList.toggle('hidden',!batterPending);
 $('nextBowlerPrompt').classList.toggle('hidden',!bowlerPending);
 $('nextPlayerPrompts').classList.toggle('hidden',!batterPending&&!bowlerPending);
 const lineup=inn.lineup?.length?inn.lineup:playersFor(inn.batting).map(player=>player.id);
 const otherBatter=m.pendingBatterSlot==='striker'?m.non:m.striker;
 const batters=lineup.map(id=>state.players.find(player=>player.id===id)).filter(player=>player&&!inn.batters[player.id]?.out&&player.id!==otherBatter);
 const currentBatter=m.pendingBatterSlot&&batters.some(player=>player.id===m[m.pendingBatterSlot])?m[m.pendingBatterSlot]:'';
 fillPlayerPick('nextBatter',batters,currentBatter);
 const bowlers=playersFor(inn.bowling),alternates=bowlers.filter(player=>player.id!==m.previousOverBowler);
 const availableBowlers=alternates.length?alternates:bowlers;
 const nextBowler=availableBowlers.some(player=>player.id===m.bowler)?m.bowler:availableBowlers[0]?.id||'';
 fillPlayerPick('nextBowler',availableBowlers,nextBowler);
 $('confirmNextBatter').disabled=!batterPending||!batters.length;
 $('confirmNextBowler').disabled=!bowlerPending||!availableBowlers.length;
}
async function confirmNextBatter(){
 const m=activeMatch();if(!m||m.status!=='live'||!m.pendingBatterSlot)return;
 const inn=getInnings(m),slot=m.pendingBatterSlot,playerId=$('nextBatter').value;
 const lineup=inn.lineup?.length?inn.lineup:playersFor(inn.batting).map(player=>player.id);
 if(!lineup.includes(playerId)||inn.batters[playerId]?.out)return toast('Choose an eligible batter from this innings lineup');
 if(playerId===(slot==='striker'?m.non:m.striker))return toast('Choose a different batter');
 m[slot]=playerId;m.pendingBatterSlot='';
 await save();renderScorer();toast(`${playerName(playerId)} selected to bat`);
}
async function confirmNextBowler(){
 const m=activeMatch();if(!m||m.status!=='live'||!m.pendingBowler)return;
 const inn=getInnings(m),playerId=$('nextBowler').value,bowlers=playersFor(inn.bowling);
 if(!bowlers.some(player=>player.id===playerId))return toast('Choose a bowler from the opposing team');
 if(bowlers.some(player=>player.id!==m.previousOverBowler)&&playerId===m.previousOverBowler)return toast('Choose a different bowler for consecutive overs');
 m.bowler=playerId;m.pendingBowler=false;
 await save();renderScorer();toast(`${playerName(playerId)} selected to bowl`);
}
function bowlingFigures(stats){
 const legal=Number(stats?.legal)||0,runs=Number(stats?.runs)||0,wickets=Number(stats?.wickets)||0;
 return {
  overs:`${Math.floor(legal/6)}.${legal%6}`,
  average:wickets?(runs/wickets).toFixed(2):'—',
  economy:legal?(runs/(legal/6)).toFixed(2):'0.00',
  strike:wickets?(legal/wickets).toFixed(2):'—'
 };
}
async function finishMatch(){const m=activeMatch();if(!m||m.status!=='live')return;if(!confirm('Finish this match now?'))return;completeMatchState(m);await save();page('history')}
function renderScorer(){
 const m=activeMatch();if(!m)return;
 if(scorecardMatchId!==m.id){scorecardMatchId=m.id;scorecardInningsIndex=Number.isInteger(m.current)?m.current:0}
 scorecardInningsIndex=Math.min(scorecardInningsIndex,Math.max(0,m.innings.length-1));
 const scorecardSelect=$('scorecardInningsSelect');
 scorecardSelect.innerHTML=m.innings.map((innings,index)=>`<option value="${index}">${index+1}${index===0?'st':index===1?'nd':'th'} innings — ${esc(team(innings.batting)?.name||'Team')}</option>`).join('');
 scorecardSelect.value=String(scorecardInningsIndex);
 scorecardSelect.onchange=()=>{scorecardInningsIndex=Number(scorecardSelect.value);renderScorecard(m,m.innings[scorecardInningsIndex])};
 const inn=getInnings(m),battingTeam=team(inn.batting),side=m.teams[0]===inn.batting?'Team A':'Team B';
 $('scorerTitle').textContent=m.title;
 $('matchMeta').textContent=`${m.format} • ${modeLabel(m.mode)} • ${m.venue||'Venue not set'} • ${m.date||''}${seriesName(m.seriesId)?' • '+seriesName(m.seriesId):''}`;
 $('inningsLabel').textContent=`${m.current+1}${m.current===0?'st':'nd'} Innings • ${side} (${battingTeam?.name||''}) batting`;
 $('scoreRuns').textContent=inn.runs;$('scoreWkts').textContent=inn.wickets;
 $('oversText').textContent=`${Math.floor(inn.legal/6)}.${inn.legal%6} overs`;
 $('runRate').textContent=inn.legal?(inn.runs/(inn.legal/6)).toFixed(2):'0.00';
 const chasing=m.current>0,target=chasing?m.innings[0].runs+1:null,needed=target===null?null:Math.max(0,target-inn.runs);
 const ballsLeft=m.overs?Math.max(0,m.overs*6-inn.legal):null;
 $('targetText').textContent=chasing?(m.status==='completed'&&needed===0?`Target ${target} reached`:`Target ${target} • Need ${needed}${ballsLeft===null?'':` from ${ballsLeft} balls`}`):'';
 $('requiredRunRate').textContent=chasing&&m.status==='live'&&ballsLeft!==null&&ballsLeft>0?`Required run rate ${(needed/(ballsLeft/6)).toFixed(2)}`:'';
 renderWinningPrediction(m,inn);
 const lineup=inn.lineup?.length?inn.lineup:playersFor(inn.batting).map(p=>p.id);
 const allBowlPlayers=playersFor(inn.bowling),differentBowlers=allBowlPlayers.filter(p=>p.id!==m.previousOverBowler);
 const batPlayers=lineup.map(id=>state.players.find(p=>p.id===id)).filter(p=>p&&(!inn.batters[p.id]?.out||p.id===m.striker||p.id===m.non)),bowlPlayers=differentBowlers.length?differentBowlers:allBowlPlayers;
 const eligibleBatters=lineup.filter(id=>!inn.batters[id]?.out);
 $('nonPlayerCell').hidden=eligibleBatters.length<2;
 $('nonStrikerPickerLabel').classList.toggle('hidden',eligibleBatters.length<2);
 fillPlayerPick('pickStriker',batPlayers,m.striker);fillPlayerPick('pickNon',batPlayers,m.non);fillPlayerPick('pickBowler',bowlPlayers,m.bowler);
 $('pickStriker').disabled=Boolean(m.pendingBatterSlot);$('pickNon').disabled=Boolean(m.pendingBatterSlot);
 $('pickBowler').disabled=Boolean(m.pendingBowler);$('changeBowler').disabled=Boolean(m.pendingBowler);
 $('swapBtn').disabled=Boolean(m.pendingBatterSlot||m.pendingBowler);
 const selectionPending=Boolean(m.pendingBatterSlot||m.pendingBowler);
 document.querySelectorAll('#scorer [data-run],#scorer [data-extra]').forEach(button=>button.disabled=selectionPending);
 $('wicketBtn').disabled=selectionPending;
 renderMatchPlayerControls(m);
 updateWicketFielderControls();
 $('outBatter').innerHTML=`<option value="striker">${esc(playerName(m.striker))} out</option>${m.non?`<option value="non">${esc(playerName(m.non))} out</option>`:''}`;
 const bs=inn.batters[m.striker]||{runs:0,balls:0},ns=inn.batters[m.non]||{runs:0,balls:0},bo=inn.bowlers[m.bowler]||{runs:0,wickets:0,legal:0};
 $('strikerName').textContent=playerName(m.striker);$('nonName').textContent=playerName(m.non);$('bowlerName').textContent=playerName(m.bowler);
 $('strikerStats').textContent=`${bs.runs} (${bs.balls})`;$('nonStats').textContent=`${ns.runs} (${ns.balls})`;$('bowlerStats').textContent=`${bo.wickets}-${bo.runs} • ${Math.floor(bo.legal/6)}.${bo.legal%6}`;
 $('overLog').innerHTML=inn.balls.length?inn.balls.map((x,i)=>`<span class="over-pill">${esc(x.text)}</span>${(i+1)%6===0?'<br>':''}`).join(''):'No deliveries yet.';
 renderLiveScoringSummary(m,inn);
 renderNextPlayerPrompts(m,inn);
 const atBreak=m.status==='live'&&m.inningsBreak,active=m.status==='live'&&!m.inningsBreak;
 $('inningsBreak').classList.toggle('hidden',!atBreak);
 if(atBreak){const first=m.innings[0],defending=team(first.bowling);$('inningsBreakSummary').textContent=`${team(first.batting)?.name||'Team'} finished on ${first.runs}/${first.wickets}. Target for ${defending?.name||'the chasing team'}: ${first.runs+1}.`}
 document.querySelector('.scoring-layout').classList.toggle('hidden',!active);
 $('endInnings').disabled=!active;$('finishMatch').disabled=!active;
 renderScorecard(m,m.innings[scorecardInningsIndex]||inn);renderMatchSummary(m);
}
function summaryText(m){
 const scores=(m.innings||[]).map((inn,index)=>`${index===0?'1st':'2nd'} Innings — ${m.teams[0]===inn.batting?'Team A':'Team B'} (${team(inn.batting)?.name||'Team'}): ${inn.runs}/${inn.wickets} (${Math.floor(inn.legal/6)}.${inn.legal%6} overs)`);
 const top=(m.innings||[]).flatMap(inn=>Object.entries(inn.batters||{}).map(([id,s])=>({name:playerName(id),runs:Number(s.runs)||0}))).sort((a,b)=>b.runs-a.runs)[0];
 return [
  `CRICDAIRY — ${m.title}`,
  `${team(m.teams[0])?.name||'Team A'} vs ${team(m.teams[1])?.name||'Team B'}`,
  `${m.format} • ${modeLabel(m.mode)}${m.date?' • '+m.date:''}${m.venue?' • '+m.venue:''}`,
  ...scores,
  m.status==='completed'?`Result: ${m.result||'Result pending'}`:'Match in progress',
  m.status==='completed'&&m.playerOfTheMatch?`Player of the Match: ${playerName(m.playerOfTheMatch)}`:'',
  seriesName(m.seriesId)?`Series: ${seriesName(m.seriesId)}`:'',
  top?`Top scorer: ${top.name} (${top.runs})`:''
 ].filter(Boolean).join('\n');
}
function renderMatchSummary(m){
 const innings=(m.innings||[]).map((inn,index)=>`<div class="summary-score"><b>${index===0?'1st':'2nd'} Innings — ${m.teams[0]===inn.batting?'Team A':'Team B'} (${esc(team(inn.batting)?.name||'Team')})</b><span>${inn.runs}/${inn.wickets}</span><small>${Math.floor(inn.legal/6)}.${inn.legal%6} overs</small></div>`).join('');
 $('matchSummary').innerHTML=`<div class="summary-result"><b>${esc(m.status==='completed'?m.result||'Result pending':'Match in progress')}</b><span>${esc(m.title)}</span>${seriesName(m.seriesId)?`<small>Series: ${esc(seriesName(m.seriesId))}</small>`:''}</div><div class="summary-scores">${innings}</div>`;
 const potm=$('playerOfMatch'),player=m.playerOfTheMatch;
 potm.classList.toggle('hidden',m.status!=='completed');
 potm.innerHTML=m.status==='completed'?`<b>Player of the Match</b><span>${player?esc(playerName(player)):'No standout performance recorded'}</span><small>Automatically selected from batting runs and bowling wickets.</small>`:'';
}
async function shareMatch(){
 const m=activeMatch();if(!m)return;
 const text=summaryText(m);
 if(navigator.share){
  try{await navigator.share({title:`${m.title} — CRICDAIRY`,text});return}
  catch(error){if(error.name==='AbortError')return}
 }
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
  else{
   const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();
   const copied=document.execCommand('copy');area.remove();if(!copied)throw new Error('Clipboard access is unavailable');
  }
  toast('Match summary copied — paste it to share');
 }catch(error){toast('Sharing is unavailable in this browser')}
}
function fillPlayerPick(id,arr,selected){$(id).innerHTML='<option value="">Select player</option>'+arr.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}
function playerName(id){return state.players.find(p=>p.id===id)?.name||'Not selected'}
function playerRoleLabel(role){return role==='Wicketkeeper'?'Wicketkeeper (WK)':role||''}
function resizeImage(file,maxSize){
 return new Promise(resolve=>{
  if(!file||!file.type.startsWith('image/')){resolve('');return}
  const reader=new FileReader();
  reader.onload=()=>{
   const img=new Image();
   img.onload=()=>{
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,maxSize/Math.max(img.width,img.height));
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL('image/jpeg',0.82));
   };
   img.onerror=()=>resolve('');
   img.src=reader.result;
  };
  reader.onerror=()=>resolve('');
  reader.readAsDataURL(file);
 });
}
async function changePlayerPhoto(id,file){
 if(!file)return;
 if(!file.type.startsWith('image/'))return toast('Please choose an image file');
 const photo=await resizeImage(file,320);
 if(!photo)return toast('Could not read this image');
 const player=state.players.find(p=>p.id===id);
 if(!player)return;
 player.photo=photo;save();toast('Player photo updated');
}
function renderScorecard(m,inn){const rows=Object.entries(inn.batters).map(([id,s])=>`<tr><td>${esc(playerName(id))}</td><td>${s.runs}</td><td>${s.balls}</td><td>${s.fours}</td><td>${s.sixes}</td><td>${s.balls?(s.runs/s.balls*100).toFixed(1):'0.0'}</td><td>${esc(s.dismissal||'not out')}</td></tr>`).join('');const br=Object.entries(inn.bowlers).map(([id,s])=>{const figures=bowlingFigures(s);return `<tr><td>${esc(playerName(id))}</td><td>${figures.overs}</td><td>${s.maidens||0}</td><td>${s.runs||0}</td><td>${s.wickets||0}</td><td>${figures.average}</td><td>${figures.economy}</td><td>${figures.strike}</td></tr>`}).join('');$('scorecard').innerHTML=`<div class="report-brand"><img src="${state.settings.profilePhoto||''}" onerror="this.style.display='none'" alt=""><div><b>CRICDAIRY</b><div>${esc(state.settings.profileName||'RAZI SHAH')}</div></div></div><h3>${esc(team(inn.batting)?.name||'Batting')} — ${inn.runs}/${inn.wickets} (${Math.floor(inn.legal/6)}.${inn.legal%6} overs)</h3><div class="table-wrap"><table><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th><th>Dismissal</th></tr></thead><tbody>${rows||'<tr><td colspan="7">No batting data yet</td></tr>'}</tbody></table></div><h3>Bowling</h3><div class="table-wrap"><table><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Avg</th><th>Econ</th><th>SR</th></tr></thead><tbody>${br||'<tr><td colspan="8">No bowling data yet</td></tr>'}</tbody></table></div><p class="hint">Extras: ${Object.entries(inn.extras).map(([k,v])=>`${k} ${v}`).join(' • ')} • Fall of wickets: ${inn.fow.map(x=>`${x.w}-${x.r} (${x.overs})`).join(', ')||'—'}</p>`}
function renderAll(){profileMarkup();fillTeamSelects();renderLauncher();renderTeams();renderPlayingPlayerSelectors();renderHistory();renderLive();renderTournaments();fillReportSelect();$('backupInfo').textContent=`${state.matches.length} matches • ${state.teams.length} teams • Auto-saved locally in this browser.`}
function renderLauncher(){
 $('menuResumeMatch').classList.toggle('hidden',!state.matches.some(m=>m.status==='live'));
}
function resumeLatestMatch(){
 const match=state.matches.find(item=>item.status==='live');
 if(!match)return toast('No live match to resume');
 currentId=match.id;page('scorer');toast('Saved match resumed');
}
function matchCard(m){return `<div class="match-card"><div><b>${esc(m.title)}</b><small>${esc(team(m.teams[0])?.name||'')} vs ${esc(team(m.teams[1])?.name||'')} • ${esc(m.format)} • ${esc(m.status)}${seriesName(m.seriesId)?' • '+esc(seriesName(m.seriesId)):''}</small><small>${m.innings.map((i,index)=>`${index===0?'1st':'2nd'} Innings — ${esc(team(i.batting)?.name||'')}: ${i.runs}/${i.wickets}`).join(' | ')}${m.status==='completed'&&m.result?' • '+esc(m.result):''}</small></div><div class="match-actions"><button data-open="${esc(m.id)}" class="ghost">${m.status==='live'?'Open / Resume':'Summary'}</button><button data-share="${esc(m.id)}" class="ghost">Share</button></div></div>`}
function seriesName(id){return state.tournaments.find(s=>s.id===id)?.name||''}
function bindCards(){document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{currentId=b.dataset.open;page('scorer')});document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>{currentId=b.dataset.share;shareMatch()})}
function renderLive(){$('liveMatches').innerHTML=state.matches.filter(m=>m.status==='live').map(matchCard).join('')||'No live matches.';bindCards()}
function renderHistory(){const q=($('historySearch')?.value||'').toLowerCase();const arr=state.matches.filter(m=>(m.title+' '+m.venue+' '+m.teams.map(id=>team(id)?.name).join(' ')).toLowerCase().includes(q));$('historyList').innerHTML=arr.map(matchCard).join('')||'No matching matches.';bindCards()}
function emptyPlayerStats(){
 return {matches:new Set(),battingInnings:0,notOuts:0,runs:0,balls:0,outs:0,fours:0,sixes:0,highScore:null,highScoreNotOut:false,centuries:0,fifties:0,ducks:0,battingDots:0,bowlingInnings:0,ballsBowled:0,runsConceded:0,wickets:0,maidens:0,wides:0,noBalls:0,bowlingDots:0,bestWickets:0,bestRuns:0,threeWicketHauls:0,fiveWicketHauls:0,catches:0,stumpings:0,runOuts:0,playerOfTheMatchAwards:0};
}
function inningsMaidens(inn,id,stored){
 const balls=inn.balls||[];
 if(!balls.some(ball=>ball.bowlerId===id))return Number(stored)||0;
 const overs=new Map();
 balls.filter(ball=>ball.bowlerId===id).forEach(ball=>{
  const over=Number(ball.over)||0;
  const figures=overs.get(over)||{legal:0,runs:0};
  if(ball.legal)figures.legal++;
  if(!['bye','legbye','penalty'].includes(ball.type))figures.runs+=Number(ball.total)||0;
  overs.set(over,figures);
 });
 return [...overs.values()].filter(over=>over.legal===6&&over.runs===0).length;
}
function playerCareerStats(){
 const stats=new Map(state.players.map(p=>[p.id,emptyPlayerStats()]));
 state.matches.forEach(m=>{
  Object.values(m.lineups||{}).forEach(lineup=>{
   if(Array.isArray(lineup))lineup.forEach(id=>stats.get(id)?.matches.add(m.id));
  });
  const award=stats.get(m.playerOfTheMatch);
  if(award){award.matches.add(m.id);award.playerOfTheMatchAwards++}
  (m.innings||[]).forEach(inn=>{
   Object.entries(inn.batters||{}).forEach(([id,bat])=>{
    if(!stats.has(id))return;
    const x=stats.get(id),runs=Number(bat.runs)||0,balls=Number(bat.balls)||0;
    x.matches.add(m.id);x.battingInnings++;x.runs+=runs;x.balls+=balls;x.outs+=bat.out?1:0;x.notOuts+=bat.out?0:1;
    x.fours+=Number(bat.fours)||0;x.sixes+=Number(bat.sixes)||0;
    if(x.highScore===null||runs>x.highScore||(runs===x.highScore&&!bat.out)) {x.highScore=runs;x.highScoreNotOut=!bat.out}
    if(runs>=100)x.centuries++;else if(runs>=50)x.fifties++;
    if(runs===0&&bat.out)x.ducks++;
   });
   Object.entries(inn.bowlers||{}).forEach(([id,bowl])=>{
    if(!stats.has(id))return;
    const x=stats.get(id),legal=Number(bowl.legal)||0,runs=Number(bowl.runs)||0,wickets=Number(bowl.wickets)||0;
    x.matches.add(m.id);x.bowlingInnings++;x.ballsBowled+=legal;x.runsConceded+=runs;x.wickets+=wickets;
    x.maidens+=inningsMaidens(inn,id,bowl.maidens);x.wides+=Number(bowl.wides)||0;x.noBalls+=Number(bowl.noballs)||0;
    if(wickets>=3)x.threeWicketHauls++;
    if(wickets>=5)x.fiveWicketHauls++;
    if(wickets>x.bestWickets||(wickets===x.bestWickets&&wickets>0&&runs<x.bestRuns)){x.bestWickets=wickets;x.bestRuns=runs}
   });
   (inn.balls||[]).forEach(ball=>{
    const batterStats=stats.get(ball.batterId);
    if(batterStats&&['run','noball'].includes(ball.type)&&Number(ball.runs)===0)batterStats.battingDots++;
    const bowlerStats=stats.get(ball.bowlerId);
    if(bowlerStats&&ball.legal&&Number(ball.total)===0)bowlerStats.bowlingDots++;
    const fielderStats=stats.get(ball.fielderId);
    if(!fielderStats||!ball.wicket)return;
    fielderStats.matches.add(m.id);
    if(ball.wicket==='Caught')fielderStats.catches++;
    else if(ball.wicket==='Stumped')fielderStats.stumpings++;
    else if(ball.wicket==='Run Out')fielderStats.runOuts++;
   });
  });
 });
 return stats;
}
function fillTeamStatsFilter(id,placeholder){
 const select=$(id),selected=select.value;
 select.innerHTML=`<option value="">${esc(placeholder)}</option>`+state.teams.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} (${teamTypeLabel(item)})</option>`).join('');
 if(Array.from(select.options).some(option=>option.value===selected))select.value=selected;
}
function renderPlayerStats(teamFilterId='playerStatsTeamFilter',playerFilterId='playerStatsPlayerFilter',statsTargetId='playerStats',rankingsTargetId='playerRankings',populateTeamFilter=true){
 if(populateTeamFilter)fillTeamStatsFilter(teamFilterId,'All teams and clubs');
 const teamFilter=$(teamFilterId),selectedTeam=teamFilter?.value||'',playerFilter=playerFilterId?$(playerFilterId):null;
 if(playerFilter){
  const previous=playerFilter.value,eligible=state.players.filter(player=>!selectedTeam||player.teamId===selectedTeam);
  playerFilter.innerHTML='<option value="">All players</option>'+eligible.map(player=>`<option value="${esc(player.id)}">${esc(player.name)}</option>`).join('');
  playerFilter.value=eligible.some(player=>player.id===previous)?previous:'';
 }
 const selectedPlayer=playerFilter?.value||'';
 const career=playerCareerStats(),query=(statsTargetId==='playerStats'?$('playerStatsSearch').value:'').trim().toLowerCase(),sortSelect=$('playerStatsSort');
 if(!sortSelect.dataset.expanded){
  sortSelect.innerHTML='<option value="runs">Most runs</option><option value="wickets">Most wickets</option><option value="average">Best batting average</option><option value="strike">Best strike rate</option><option value="matches">Most matches</option><option value="catches">Most catches</option><option value="name">Player name</option>';
  sortSelect.dataset.expanded='true';
 }
 const sort=sortSelect.value||'runs';
 const players=state.players.filter(p=>(!selectedTeam||p.teamId===selectedTeam)&&(!selectedPlayer||p.id===selectedPlayer)&&p.name.toLowerCase().includes(query)).map(p=>({p,s:career.get(p.id)||emptyPlayerStats()}));
 const average=s=>s.outs?s.runs/s.outs:-1,strike=s=>s.balls?s.runs/s.balls*100:0;
 players.sort((a,b)=>{
  if(sort==='name')return a.p.name.localeCompare(b.p.name);
  const value={runs:'runs',wickets:'wickets',average:'average',strike:'strike',matches:'matches',catches:'catches'}[sort];
  const score=s=>value==='average'?average(s):value==='strike'?strike(s):value==='matches'?s.matches.size:s[value]||0;
  return score(b.s)-score(a.s)||a.p.name.localeCompare(b.p.name);
 });
 const playerCell=({p})=>`<button type="button" class="player-stat-link" data-player-profile="${esc(p.id)}">${esc(p.name)}</button><br><small>${esc(team(p.teamId)?.name||'—')} • ${esc(playerRoleLabel(p.role))}</small>`;
 const batting=players.map(({p,s})=>`<tr><td>${playerCell({p})}</td><td>${s.matches.size}</td><td>${s.battingInnings}</td><td>${s.notOuts}</td><td>${s.runs}</td><td>${s.highScore===null?'—':`${s.highScore}${s.highScoreNotOut?'*':''}`}</td><td>${s.outs?(s.runs/s.outs).toFixed(2):'—'}</td><td>${s.balls}</td><td>${s.balls?(s.runs/s.balls*100).toFixed(2):'0.00'}</td><td>${s.centuries}</td><td>${s.fifties}</td><td>${s.fours}</td><td>${s.sixes}</td><td>${s.ducks}</td><td>${s.battingDots}</td></tr>`).join('');
 const bowling=players.map(({p,s})=>{
  const overs=`${Math.floor(s.ballsBowled/6)}.${s.ballsBowled%6}`,average=s.wickets?(s.runsConceded/s.wickets).toFixed(2):'—',economy=s.ballsBowled?(s.runsConceded/(s.ballsBowled/6)).toFixed(2):'0.00',strike=s.wickets?(s.ballsBowled/s.wickets).toFixed(2):'—';
  return `<tr><td>${playerCell({p})}</td><td>${s.bowlingInnings}</td><td>${overs}</td><td>${s.maidens}</td><td>${s.runsConceded}</td><td>${s.wickets}</td><td>${s.bestWickets?`${s.bestWickets}/${s.bestRuns}`:'—'}</td><td>${average}</td><td>${economy}</td><td>${strike}</td><td>${s.threeWicketHauls}</td><td>${s.fiveWicketHauls}</td><td>${s.wides}</td><td>${s.noBalls}</td><td>${s.bowlingDots}</td></tr>`;
 }).join('');
 const fielding=players.map(({p,s})=>`<tr><td>${playerCell({p})}</td><td>${s.catches}</td><td>${s.stumpings}</td><td>${s.runOuts}</td><td>${s.catches+s.stumpings+s.runOuts}</td><td>${s.playerOfTheMatchAwards}</td></tr>`).join('');
 $(statsTargetId).innerHTML=players.length?`
  <h3>Batting</h3><div class="table-wrap"><table><thead><tr><th>Player / Team</th><th>Mat</th><th>Inn</th><th>NO</th><th>Runs</th><th>HS</th><th>Avg</th><th>BF</th><th>SR</th><th>100s</th><th>50s</th><th>4s</th><th>6s</th><th>Ducks</th><th>Dots</th></tr></thead><tbody>${batting}</tbody></table></div>
  <h3>Bowling</h3><div class="table-wrap"><table><thead><tr><th>Player / Team</th><th>Inn</th><th>Overs</th><th>M</th><th>Runs</th><th>Wkts</th><th>Best</th><th>Avg</th><th>Econ</th><th>SR</th><th>3W</th><th>5W</th><th>Wd</th><th>Nb</th><th>Dots</th></tr></thead><tbody>${bowling}</tbody></table></div>
  <h3>Fielding & Awards</h3><div class="table-wrap"><table><thead><tr><th>Player / Team</th><th>Catches</th><th>Stumpings</th><th>Run outs</th><th>Total dismissals</th><th>Player of the Match</th></tr></thead><tbody>${fielding}</tbody></table></div>`:`<p class="muted">No player statistics found.</p>`;
 const ranked=key=>[...players].sort((a,b)=>b.s[key]-a.s[key]||a.p.name.localeCompare(b.p.name)).slice(0,10).map(({p,s},index)=>`<tr><td>${index+1}</td><td><button type="button" class="player-stat-link" data-player-profile="${esc(p.id)}">${esc(p.name)}</button></td><td>${s[key]}</td><td>${esc(team(p.teamId)?.name||'—')}</td></tr>`).join('');
 $(rankingsTargetId).innerHTML=players.length?`<h3>Player Rankings</h3><div class="ranking-grid"><div><h4>Top Run Scorers</h4><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Player</th><th>Runs</th><th>Team</th></tr></thead><tbody>${ranked('runs','runs')}</tbody></table></div></div><div><h4>Top Wicket Takers</h4><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Player</th><th>Wickets</th><th>Team</th></tr></thead><tbody>${ranked('wickets','wickets')}</tbody></table></div></div><div><h4>Top Fielders</h4><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Player</th><th>Dismissals</th><th>Team</th></tr></thead><tbody>${[...players].sort((a,b)=>(b.s.catches+b.s.stumpings+b.s.runOuts)-(a.s.catches+a.s.stumpings+a.s.runOuts)||a.p.name.localeCompare(b.p.name)).slice(0,10).map(({p,s},index)=>`<tr><td>${index+1}</td><td><button type="button" class="player-stat-link" data-player-profile="${esc(p.id)}">${esc(p.name)}</button></td><td>${s.catches+s.stumpings+s.runOuts}</td><td>${esc(team(p.teamId)?.name||'—')}</td></tr>`).join('')}</tbody></table></div></div></div>`:'';
 document.querySelectorAll('[data-player-profile]').forEach(button=>button.onclick=()=>{currentPlayerId=button.dataset.playerProfile;page('playerProfile')});
}
function renderPlayerProfile(){
 const player=state.players.find(item=>item.id===currentPlayerId);
 if(!player){$('playerProfileContent').innerHTML='<p class="muted">Player not found.</p>';return}
 const stats=playerCareerStats().get(player.id)||emptyPlayerStats(),average=stats.outs?(stats.runs/stats.outs).toFixed(2):'—',strike=stats.balls?(stats.runs/stats.balls*100).toFixed(2):'0.00';
 const photo=player.photo?`<img class="player-profile-photo" src="${esc(player.photo)}" alt="${esc(player.name)}">`:`<div class="player-profile-photo player-profile-initial">${esc((player.name.trim()[0]||'P').toUpperCase())}</div>`;
 const matches=state.matches.filter(match=>match.playerOfTheMatch===player.id||Object.values(match.lineups||{}).some(lineup=>Array.isArray(lineup)&&lineup.includes(player.id))||match.innings?.some(inn=>inn.batters?.[player.id]||inn.bowlers?.[player.id]||(inn.balls||[]).some(ball=>ball.fielderId===player.id)));
 const rows=matches.map(match=>{
  const batting=[],bowling=[];let catches=0,stumpings=0,runOuts=0;
  (match.innings||[]).forEach((inn,index)=>{
   const bat=inn.batters?.[player.id];
   if(bat)batting.push(`${index+1}${index===0?'st':index===1?'nd':'th'}: ${Number(bat.runs)||0} (${Number(bat.balls)||0})${bat.out?' out':'*'}`);
   const bowl=inn.bowlers?.[player.id];
   if(bowl)bowling.push(`${index+1}${index===0?'st':index===1?'nd':'th'}: ${Math.floor((Number(bowl.legal)||0)/6)}.${(Number(bowl.legal)||0)%6}-${Number(bowl.runs)||0}-${Number(bowl.wickets)||0}`);
   (inn.balls||[]).filter(ball=>ball.fielderId===player.id).forEach(ball=>{if(ball.wicket==='Caught')catches++;else if(ball.wicket==='Stumped')stumpings++;else if(ball.wicket==='Run Out')runOuts++});
  });
  const opponent=(match.teams||[]).filter(id=>id!==player.teamId).map(id=>team(id)?.name||'Team').join(', ')||'—';
  return `<tr><td>${esc(match.title||'Match')}</td><td>${esc(match.date||'—')}</td><td>${esc(opponent)}</td><td>${esc(match.status||'')}</td><td>${batting.join('<br>')||'—'}</td><td>${bowling.join('<br>')||'—'}</td><td>${catches} / ${stumpings} / ${runOuts}</td><td>${match.playerOfTheMatch===player.id?'Yes':'—'}</td></tr>`;
 }).join('');
 $('playerProfileTitle').textContent=player.name;
 $('playerProfileContent').innerHTML=`<div class="panel player-profile-heading">${photo}<div><h2>${esc(player.name)}</h2><p>${esc(team(player.teamId)?.name||'—')} • ${esc(playerRoleLabel(player.role)||'Player')}</p><small>${stats.matches.size} matches • ${stats.playerOfTheMatchAwards} Player of the Match awards</small></div><button type="button" class="ghost" id="editPlayerProfile">Edit profile</button></div><div id="playerProfileEditForm" class="panel hidden"><h3>Edit player profile</h3><div class="form-grid"><label>Player name<input id="editPlayerName" maxlength="60"></label><label>Team<select id="editPlayerTeam"></select></label><label>Role<select id="editPlayerRole"><option>All-rounder</option><option>Batter</option><option>Bowler</option><option>Wicketkeeper</option></select></label><label>Profile photo (optional)<input id="editPlayerPhoto" type="file" accept="image/*"></label><label class="photo-remove-option"><input id="removePlayerProfilePhoto" type="checkbox"> Remove current profile photo</label></div><div class="actions"><button type="button" class="primary" id="savePlayerProfile">Save changes</button><button type="button" class="ghost" id="cancelPlayerProfileEdit">Cancel</button></div></div><div class="profile-stat-grid"><div class="stat"><small>Runs / High score</small><strong>${stats.runs} / ${stats.highScore===null?'—':`${stats.highScore}${stats.highScoreNotOut?'*':''}`}</strong></div><div class="stat"><small>Batting average / strike rate</small><strong>${average} / ${strike}</strong></div><div class="stat"><small>Wickets / Best</small><strong>${stats.wickets} / ${stats.bestWickets?`${stats.bestWickets}/${stats.bestRuns}`:'—'}</strong></div><div class="stat"><small>Economy / overs</small><strong>${stats.ballsBowled?(stats.runsConceded/(stats.ballsBowled/6)).toFixed(2):'0.00'} / ${Math.floor(stats.ballsBowled/6)}.${stats.ballsBowled%6}</strong></div><div class="stat"><small>4s / 6s / 50s / 100s</small><strong>${stats.fours} / ${stats.sixes} / ${stats.fifties} / ${stats.centuries}</strong></div><div class="stat"><small>Catches / stumpings / run outs</small><strong>${stats.catches} / ${stats.stumpings} / ${stats.runOuts}</strong></div></div><div class="panel table-wrap"><h3>Match-by-match record</h3><table><thead><tr><th>Match</th><th>Date</th><th>Opponent</th><th>Status</th><th>Batting</th><th>Bowling</th><th>C / S / RO</th><th>POTM</th></tr></thead><tbody>${rows||'<tr><td colspan="8">No match records yet.</td></tr>'}</tbody></table></div>`;
 $('editPlayerProfile').onclick=()=>{
  const teams=state.teams.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  $('editPlayerTeam').innerHTML=teams;
  $('editPlayerTeam').value=player.teamId;
  const roles=['All-rounder','Batter','Bowler','Wicketkeeper'];
  if(player.role&&!roles.includes(player.role))roles.push(player.role);
  $('editPlayerRole').innerHTML=roles.map(role=>`<option value="${esc(role)}">${esc(playerRoleLabel(role))}</option>`).join('');
  $('editPlayerRole').value=player.role||'All-rounder';
  $('editPlayerName').value=player.name;
  $('editPlayerPhoto').value='';
  $('removePlayerProfilePhoto').checked=false;
  $('playerProfileEditForm').classList.remove('hidden');
 };
 $('cancelPlayerProfileEdit').onclick=()=>$('playerProfileEditForm').classList.add('hidden');
 $('savePlayerProfile').onclick=async()=>{
  const name=$('editPlayerName').value.trim(),teamId=$('editPlayerTeam').value,file=$('editPlayerPhoto').files[0];
  if(!name||!state.teams.some(item=>item.id===teamId))return toast('Enter a player name and select a team');
  if(file&&!file.type.startsWith('image/'))return toast('Please choose an image file');
  let photo=$('removePlayerProfilePhoto').checked?'':player.photo||'';
  if(file)photo=await resizeImage(file,320);
  player.name=name;player.teamId=teamId;player.role=$('editPlayerRole').value;player.photo=photo;
  await save();renderAll();renderPlayerProfile();toast('Player profile updated');
 };
}
function teamCareerStats(){
 const records=new Map(state.teams.map(item=>[item.id,{played:0,wins:0,losses:0,ties:0,noResults:0,runsFor:0,runsAgainst:0,ballsFaced:0,ballsBowled:0,highest:0,matches:[]}]));
 state.matches.forEach(match=>{
  (match.teams||[]).forEach(id=>records.get(id)?.matches.push(match));
  (match.innings||[]).forEach(inn=>{
   const record=records.get(inn.batting);
   if(record){record.runsFor+=Number(inn.runs)||0;record.ballsFaced+=Number(inn.legal)||0;record.highest=Math.max(record.highest,Number(inn.runs)||0)}
   const bowling=records.get(inn.bowling);
   if(bowling){bowling.runsAgainst+=Number(inn.runs)||0;bowling.ballsBowled+=Number(inn.legal)||0}
  });
  if(match.status!=='completed')return;
  const first=match.innings?.[0],second=match.innings?.[1];
  if(!first||!second){(match.teams||[]).forEach(id=>{const record=records.get(id);if(record)record.noResults++});return}
  const winner=first.runs===second.runs?null:second.runs>first.runs?second.batting:first.batting;
  (match.teams||[]).forEach(id=>{
   const record=records.get(id);if(!record)return;
   record.played++;
   if(!winner)record.ties++;
   else if(winner===id)record.wins++;
   else record.losses++;
  });
 });
 return records;
}
function renderTeamStats(){
 fillTeamStatsFilter('teamStatsFilter','Select a team or club');
 const selectedTeamId=$('teamStatsFilter').value,selectedTeam=team(selectedTeamId),selectedRecord=teamCareerStats().get(selectedTeamId);
 $('teamPlayerStatsPanel').classList.toggle('hidden',!selectedTeam);
 if(selectedTeam&&selectedRecord){
  $('selectedTeamSummary').innerHTML=`<div class="profile-stat-grid"><div class="stat"><small>${esc(teamTypeLabel(selectedTeam))} • Played / won / lost</small><strong>${selectedRecord.played} / ${selectedRecord.wins} / ${selectedRecord.losses}</strong></div><div class="stat"><small>Tied / no result</small><strong>${selectedRecord.ties} / ${selectedRecord.noResults}</strong></div><div class="stat"><small>Points / win percentage</small><strong>${selectedRecord.wins*2+selectedRecord.ties} / ${selectedRecord.played?((selectedRecord.wins+selectedRecord.ties/2)*100/selectedRecord.played).toFixed(1):'0.0'}%</strong></div><div class="stat"><small>Runs for / against</small><strong>${selectedRecord.runsFor} / ${selectedRecord.runsAgainst}</strong></div></div>`;
  $('teamPlayerStatsPanel').querySelector('h2').textContent=`${selectedTeam.name} player statistics`;
  renderPlayerStats('teamStatsFilter',null,'teamPlayerStats','teamPlayerRankings',false);
 }else{
  $('selectedTeamSummary').textContent='Choose a team or club to view its record and players.';
  $('teamPlayerStats').innerHTML='';
  $('teamPlayerRankings').innerHTML='';
 }
 const records=teamCareerStats(),rows=[...records.entries()].sort((a,b)=>{
  const points=r=>r.wins*2+r.ties,percent=r=>r.played?(r.wins+r.ties/2)/r.played:0;
  return points(b[1])-points(a[1])||percent(b[1])-percent(a[1])||b[1].runsFor-a[1].runsFor||(team(a[0])?.name||'').localeCompare(team(b[0])?.name||'');
 });
 $('teamStatsContent').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Team</th><th>Type</th><th>Played</th><th>Won</th><th>Lost</th><th>Tied</th><th>No result</th><th>Points</th><th>Win %</th><th>Runs for / against</th><th>Highest innings</th></tr></thead><tbody>${rows.map(([id,r],index)=>`<tr><td>${index+1}</td><td><button type="button" class="team-stat-link" data-team-profile="${esc(id)}">${esc(team(id)?.name||'Team')}</button></td><td>${esc(teamTypeLabel(team(id)))}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.ties}</td><td>${r.noResults}</td><td>${r.wins*2+r.ties}</td><td>${r.played?((r.wins+r.ties/2)*100/r.played).toFixed(1):'0.0'}%</td><td>${r.runsFor} / ${r.runsAgainst}</td><td>${r.highest}</td></tr>`).join('')}</tbody></table></div><p class="hint">Rankings use 2 points per win and 1 per tie; teams without a completed match have no result points yet.</p>`:'<p class="muted">Add teams to see team statistics and rankings.</p>';
 document.querySelectorAll('[data-team-profile]').forEach(button=>button.onclick=()=>{currentTeamId=button.dataset.teamProfile;page('teamProfile')});
}
function renderTeamProfile(){
 const selectedTeam=team(currentTeamId),record=teamCareerStats().get(currentTeamId);
 if(!selectedTeam||!record){$('teamProfileContent').innerHTML='<p class="muted">Team not found.</p>';return}
 const battingRate=record.ballsFaced?(record.runsFor/(record.ballsFaced/6)).toFixed(2):'0.00',bowlingRate=record.ballsBowled?(record.runsAgainst/(record.ballsBowled/6)).toFixed(2):'0.00';
 const matches=record.matches.slice().sort((a,b)=>(b.created||0)-(a.created||0)).map(match=>{
  const scores=(match.innings||[]).map(inn=>`${esc(team(inn.batting)?.name||'Team')}: ${inn.runs}/${inn.wickets}`).join(' • ')||'No score yet';
  return `<tr><td>${esc(match.title||'Match')}</td><td>${esc(match.date||'—')}</td><td>${scores}</td><td>${esc(match.status||'')}</td><td>${esc(match.result||'—')}</td></tr>`;
 }).join('');
 const roster=playersFor(selectedTeam.id).map(player=>`<button type="button" class="player-stat-link" data-player-profile="${esc(player.id)}">${esc(player.name)}</button> <small>${esc(playerRoleLabel(player.role))}</small>`).join(' • ')||'<span class="muted">No players on this team yet.</span>';
 $('teamProfileTitle').textContent=selectedTeam.name;
 $('teamProfileContent').innerHTML=`<p class="eyebrow">${teamTypeLabel(selectedTeam)}</p><div class="profile-stat-grid"><div class="stat"><small>Played / won / lost</small><strong>${record.played} / ${record.wins} / ${record.losses}</strong></div><div class="stat"><small>Tied / no result</small><strong>${record.ties} / ${record.noResults}</strong></div><div class="stat"><small>Points / win percentage</small><strong>${record.wins*2+record.ties} / ${record.played?((record.wins+record.ties/2)*100/record.played).toFixed(1):'0.0'}%</strong></div><div class="stat"><small>Runs for / against</small><strong>${record.runsFor} / ${record.runsAgainst}</strong></div><div class="stat"><small>Batting / bowling run rate</small><strong>${battingRate} / ${bowlingRate}</strong></div><div class="stat"><small>Highest innings</small><strong>${record.highest}</strong></div></div><div class="panel team-roster"><h3>Players</h3><div>${roster}</div></div><div class="panel table-wrap"><h3>Match history</h3><table><thead><tr><th>Match</th><th>Date</th><th>Scores</th><th>Status</th><th>Result</th></tr></thead><tbody>${matches||'<tr><td colspan="5">No match records yet.</td></tr>'}</tbody></table></div>`;
 document.querySelectorAll('#teamProfileContent [data-player-profile]').forEach(button=>button.onclick=()=>{currentPlayerId=button.dataset.playerProfile;page('playerProfile')});
}
function renderTeams(){
 $('teamList').innerHTML=state.teams.map(t=>`<div class="player-row"><div><button type="button" class="team-stat-link" data-team-profile="${esc(t.id)}">${esc(t.name)}</button><small class="team-type-label">${teamTypeLabel(t)}</small></div><small>${playersFor(t.id).length} players</small></div>`).join('')||'<p class="muted">No teams added.</p>';
 document.querySelectorAll('#teamList [data-team-profile]').forEach(button=>button.onclick=()=>{currentTeamId=button.dataset.teamProfile;page('teamProfile')});
 $('playerList').innerHTML=state.players.map(p=>{
  const initial=(p.name?.trim()[0]||'P').toUpperCase();
  const avatar=p.photo?`<img src="${p.photo}" alt="${esc(p.name)}">`:`<span class="player-avatar-fallback">${esc(initial)}</span>`;
  return `<div class="player-row editable-player"><div class="player-main">${avatar}<div><b>${esc(p.name)}</b><small>${esc(team(p.teamId)?.name||'')} • ${esc(playerRoleLabel(p.role))}</small></div></div><div class="player-photo-actions"><button type="button" class="ghost player-photo-change" data-player-id="${p.id}">Change photo</button><button type="button" class="ghost player-photo-remove" data-player-id="${p.id}" ${p.photo?'':'disabled'}>Remove</button><input class="player-photo-input" type="file" accept="image/*" data-player-id="${p.id}" hidden></div></div>`;
 }).join('')||'<p class="muted">No players added.</p>';
 document.querySelectorAll('.player-photo-change').forEach(button=>{
  button.onclick=()=>document.querySelector(`.player-photo-input[data-player-id="${button.dataset.playerId}"]`)?.click();
 });
 document.querySelectorAll('.player-photo-input').forEach(input=>{
  input.onchange=()=>changePlayerPhoto(input.dataset.playerId,input.files[0]);
 });
 document.querySelectorAll('.player-photo-remove').forEach(button=>{
  button.onclick=()=>{
   const player=state.players.find(p=>p.id===button.dataset.playerId);
   if(!player||!player.photo)return;
   player.photo='';save();toast('Player photo removed');
  };
 });
 renderPlayerStats();
}
function renderTournaments(){
 renderTournamentTeamPicker();
 $('tournamentList').innerHTML=state.tournaments.map(series=>{
  const matches=state.matches.filter(m=>m.seriesId===series.id);
  const completed=matches.filter(m=>m.status==='completed');
  const teamIds=Array.isArray(series.teamIds)&&series.teamIds.length?series.teamIds.filter(id=>team(id)):[...new Set(matches.flatMap(match=>match.teams||[]))];
  const records=new Map(teamIds.map(id=>[id,{wins:0,ties:0}]));
  completed.forEach(m=>{
   const first=m.innings?.[0],second=m.innings?.[1];if(!first||!second)return;
   if(first.runs===second.runs){m.teams.forEach(id=>{const record=records.get(id);if(record)record.ties++})}
   else{
    const winner=second.runs>first.runs?second.batting:first.batting,record=records.get(winner);
    if(record)record.wins++;
   }
  });
  const teams=teamIds.map(id=>team(id)?.name||'Team');
  const participantText=teams.length?teams.map(esc).join(' • '):'No teams assigned; choose teams when starting the match.';
  const canStart=teamIds.length>=2||state.teams.length>=2;
  const recordText=[...records].map(([id,record])=>`${team(id)?.name||'Team'} ${record.wins}W/${record.ties}T`).join(' • ');
  return `<div class="series-card"><div class="section-head"><div><b>🏆 ${esc(series.name)}</b><small>${matches.length} match${matches.length===1?'':'es'} • ${completed.length} completed</small><small>Teams / clubs: ${participantText}</small></div><div class="series-actions"><div class="series-record">${esc(recordText||'No results yet')}</div><button class="primary" data-start-series="${esc(series.id)}" ${canStart?'':'disabled'}>Start match</button></div></div>${matches.length?matches.map(m=>`<div class="series-match"><span>${esc(m.title)}</span><small>${esc(m.status)}${m.result?' • '+esc(m.result):''}</small><button class="ghost" data-open="${esc(m.id)}">Open</button></div>`).join(''):'<p class="muted">No matches linked yet.</p>'}</div>`;
 }).join('')||'<p class="muted">No series created yet.</p>';
 document.querySelectorAll('[data-start-series]').forEach(button=>button.onclick=()=>startSeriesMatch(button.dataset.startSeries));
 bindCards();
 $('pointsTable').innerHTML='';
}
function renderTournamentTeamPicker(){
 const picker=$('tournamentTeamPicker');
 picker.innerHTML=state.teams.length?state.teams.map(item=>`<label class="tournament-team-option"><input type="checkbox" class="tournament-team-choice" value="${esc(item.id)}"><span>${esc(item.name)}<small>${teamTypeLabel(item)}</small></span></label>`).join(''):'<p class="muted">Add teams or clubs before creating a series.</p>';
}
function startSeriesMatch(seriesId){
 const series=state.tournaments.find(item=>item.id===seriesId);
 if(!series)return toast('Series not found');
 const teamIds=(series.teamIds||[]).filter(id=>team(id));
 const participants=teamIds.length>=2?teamIds:state.teams.map(item=>item.id);
 if(participants.length<2)return toast('Add at least two teams or clubs before starting a match');
 page('newmatch');
 $('matchSeries').value=series.id;fillTeamSelects();
 $('teamA').value=participants[0];$('teamB').value=participants[1];updateTossWinnerOptions(participants[0]);
 updateMatchModeInfo();renderPlayingPlayerSelectors();
 toast(`Match setup opened for ${series.name}`);
}
function fillReportSelect(){$('reportMatch').innerHTML=state.matches.map(m=>`<option value="${m.id}">${esc(m.title)} — ${esc(m.status)}</option>`).join('')}
function exportJson(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});download(blob,'cricdairy-backup-'+new Date().toISOString().slice(0,10)+'.json');toast('Backup downloaded')}
function restoreJson(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d?.teams)||!Array.isArray(d?.matches)||!Array.isArray(d?.players))throw Error();if(!confirm('Replace current local data with this backup?'))return;state=normalizeState(d);save();renderAll();toast('Backup restored')}catch(err){toast('Invalid backup file')}};r.readAsText(f);e.target.value=''}
function exportCsv(){const rows=[['Match','Team A','Team B','Format','Status','Innings 1','Innings 2','Result'],...state.matches.map(m=>[m.title,team(m.teams[0])?.name,team(m.teams[1])?.name,m.format,m.status,`${m.innings[0]?.runs}/${m.innings[0]?.wickets}`,`${m.innings[1]?.runs??''}/${m.innings[1]?.wickets??''}`,m.result||''])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');download(new Blob(['\ufeff'+csv],{type:'text/csv'}),'cricdairy-matches.csv')}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function demo(){let a=state.teams.find(t=>t.name==='Green XI'),b=state.teams.find(t=>t.name==='City Stars');if(!a){a={id:uid(),name:'Green XI'};state.teams.push(a)}if(!b){b={id:uid(),name:'City Stars'};state.teams.push(b)}for(let i=1;i<=11;i++){if(!state.players.some(p=>p.teamId===a.id&&p.name===`Green Player ${i}`))state.players.push({id:uid(),name:`Green Player ${i}`,teamId:a.id,role:i>7?'Bowler':'Batter'}) ;if(!state.players.some(p=>p.teamId===b.id&&p.name===`City Player ${i}`))state.players.push({id:uid(),name:`City Player ${i}`,teamId:b.id,role:i>7?'Bowler':'Batter'})}const m={id:uid(),title:'CRICDAIRY Demo Match',format:'T10',overs:10,venue:'Demo Ground',date:new Date().toISOString().slice(0,10),teams:[a.id,b.id],toss:{winner:a.id,decision:'bat'},innings:[newInnings(a.id,b.id)],current:0,status:'live',created:Date.now()};state.matches.unshift(m);currentId=m.id;save();page('scorer');toast('Demo match ready')}
init();