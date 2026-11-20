let state, currentId=null, currentPlayerId=null, currentTeamId=null, scorecardMatchId=null, scorecardInningsIndex=0, undoStack=[], lang='en', saveRevision=0, pendingDelivery=null, installPromptEvent=null, swipeStart=null, editingTournamentId=null, editingMatchId=null;
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
function modeLabel(mode){return ({standard:'Standard (full team)',custom:'Custom players per side'})[mode]||'Standard (full team)'}
function addTeam(name,type='other'){if(!name.trim())return;state.teams.push({id:uid(),name:name.trim(),type,captainId:''});save()}
function init(){
 state=window.__initialState||null;
 history.replaceState({cricdairyApp:true,screen:'home'},'',location.href);
 window.addEventListener('popstate',()=>{page('home',false);history.replaceState({cricdairyApp:true,screen:'home'},'',location.href)});
 Store.init().then(data=>{state=normalizeState(data||Store.defaults());lang='en';$('matchDate').value=new Date().toISOString().slice(0,10);renderAll();setup();if(!data?.settings?.profileName||data.settings.profileName==='Admin'||data?.settings?.login!==undefined||data?.settings?.password!==undefined||data?.settings?.lang!=='en')Store.save(state).then(ok=>{if(ok)$('saveStatus').textContent='Saved on this device'});if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});});
}
function normalizeState(data){
 const defaults=Store.defaults();
 const normalized={
  teams:(Array.isArray(data?.teams)?data.teams:defaults.teams).map(item=>({...item,captainId:item.captainId||''})),
  players:(Array.isArray(data?.players)?data.players:defaults.players).map(p=>({...p,photo:typeof p.photo==='string'?p.photo:'',stats:p.stats||{runs:0,balls:0,wickets:0,matches:0}})),
  matches:Array.isArray(data?.matches)?data.matches:defaults.matches,
  tournaments:(Array.isArray(data?.tournaments)?data.tournaments:defaults.tournaments).map(series=>({...series,teamIds:Array.isArray(series.teamIds)?series.teamIds:[],matchCount:Math.max(1,Number(series.matchCount)||1)})),
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
  const reserves=m.reserves&&typeof m.reserves==='object'?m.reserves:{};
  const wicketkeepers=m.wicketkeepers&&typeof m.wicketkeepers==='object'?m.wicketkeepers:{};
  const captains=m.captains&&typeof m.captains==='object'?m.captains:{[teams[0]]:'',[teams[1]]:''};
  const playerCounts=m.playerCounts&&typeof m.playerCounts==='object'?m.playerCounts:{[teams[0]]:lineups[teams[0]]?.length||1,[teams[1]]:lineups[teams[1]]?.length||1};
  return {...m,teams,lineups,reserves,wicketkeepers,captains,playerCounts,mode:m.mode==='custom'?'custom':'standard',seriesId:m.seriesId||'',innings,current:Number.isInteger(m.current)?m.current:0,inningsBreak:Boolean(m.inningsBreak),pendingBowler:Boolean(m.pendingBowler),pendingBatterSlot:['striker','non'].includes(m.pendingBatterSlot)?m.pendingBatterSlot:''};
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
 $('addPlayer').onclick=async()=>{const name=$('newPlayerName').value.trim(),teamId=$('playerTeam').value;if(!name||!teamId)return toast('Enter player name and team');if(playersFor(teamId).some(player=>player.name.trim().toLowerCase()===name.toLowerCase()))return toast('This player is already in the selected team or club');const f=$('playerPhoto').files[0];const photo=f&&f.type.startsWith('image/')?await resizeImage(f,320):'';state.players.push({id:uid(),name,teamId,role:$('playerRole').value,photo,stats:{runs:0,balls:0,wickets:0,matches:0}});$('newPlayerName').value='';$('playerPhoto').value='';save();renderAll();toast('Player added')};
 $('addPlayingPlayerA').onclick=()=>addPlayingPlayer('A');
 $('addPlayingPlayerB').onclick=()=>addPlayingPlayer('B');
 $('startMatch').onclick=startMatch;
 $('matchMode').onchange=()=>{updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('teamA').onchange=()=>{updateTossWinnerOptions();updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('teamB').onchange=()=>{updateTossWinnerOptions();updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('matchFormat').onchange=()=>{const format=$('matchFormat').value;const defaults={T5:5,T10:10,T15:15,T20:20,T25:25,T30:30,'ODI 50 Overs':50,Custom:20};if(format!=='Test Match')$('matchOvers').value=defaults[format]||20;updateMatchModeInfo()};
 $('countA').onchange=()=>updatePlayingCount('A');
 $('countB').onchange=()=>updatePlayingCount('B');
 document.querySelectorAll('[data-lineup-preset]').forEach(button=>button.onclick=()=>setPlayingCountPreset(button.dataset.lineupPreset,Number(button.dataset.count)));
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
 $('saveMatchSubstitution').onclick=substituteMatchPlayer;
 $('saveMatchWK').onclick=changeMatchWicketkeeper;
 $('matchSubTeam').onchange=()=>renderMatchSubstitutionControls(activeMatch());
 $('matchWKTeam').onchange=()=>renderMatchSubstitutionControls(activeMatch());
 $('matchSeries').onchange=()=>{fillTeamSelects();updateMatchModeInfo();renderPlayingPlayerSelectors()};
 $('playerTeam').onchange=renderTeams;
 $('teamCaptainSelect').onchange=()=>setTeamCaptain($('playerTeam').value,$('teamCaptainSelect').value);
 $('undoBtn').onclick=undo;$('swapBtn').onclick=()=>{const m=activeMatch();if(m&&m.non){[m.striker,m.non]=[m.non,m.striker];save()}};
 $('changeBowler').onclick=()=>{const m=activeMatch();if(!m)return;const v=$('pickBowler').value;if(v){m.bowler=v;save()}};
 $('pickStriker').onchange=e=>{const m=activeMatch();if(m){if(e.target.value&&e.target.value===m.non){toast('Choose a different non-striker');renderScorer();return}m.striker=e.target.value;save()}};
 $('pickNon').onchange=e=>{const m=activeMatch();if(m){if(e.target.value&&e.target.value===m.striker){toast('Choose a different striker');renderScorer();return}m.non=e.target.value;save()}};
 $('pickBowler').onchange=e=>{const m=activeMatch();if(m){m.bowler=e.target.value;save()}};
 $('endInnings').onclick=endInnings;$('startNextInnings').onclick=startNextInnings;$('finishMatch').onclick=finishMatch;$('backLive').onclick=()=>page('live');$('printScore').textContent='Print / Save PDF';$('printScore').onclick=printMatchReport;
 $('shareMatch').onclick=shareMatch;
 if($('reportShare'))$('reportShare').onclick=()=>{const id=$('reportMatch').value;if(id){currentId=id;shareMatch()}else toast('Choose a match to share')};
 $('installApp').onclick=installApp;
 $('historySearch').oninput=renderHistory;
 $('playerStatsSearch').oninput=()=>renderPlayerStats();
 $('playerStatsSort').onchange=()=>renderPlayerStats();
 $('playerStatsTeamFilter').onchange=()=>renderPlayerStats();
 $('playerStatsPlayerFilter').onchange=()=>renderPlayerStats();
 $('teamStatsFilter').onchange=renderTeamStats;
 $('addTournament').onclick=createTournament;
 $('exportJson').onclick=exportJson;$('restoreJson').onchange=restoreJson;$('exportCsv').onclick=exportCsv;
 $('reportPrint').onclick=()=>{const id=$('reportMatch').value;if(id){currentId=id;page('scorer');setTimeout(printMatchReport,250)}};
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
 $('countA').readOnly=false;$('countB').readOnly=false;
 document.querySelectorAll('[data-lineup-preset]').forEach(button=>button.disabled=false);
 const countA=playersFor($('teamA').value).length,countB=playersFor($('teamB').value).length;
 $('matchModeHint').textContent=`${modeLabel(mode)}: select the players who will play. Squads have ${countA} and ${countB} players; each side can select up to 15.`;
 const standard=mode==='standard';
 if($('reserveALabel'))$('reserveALabel').hidden=!standard;
 if($('reserveA'))$('reserveA').hidden=!standard;
 if($('reserveBLabel'))$('reserveBLabel').hidden=!standard;
 if($('reserveB'))$('reserveB').hidden=!standard;
}
function selectedPlayingIds(teamKey){
 return Array.from(document.querySelectorAll(`.select-${teamKey}:checked`)).map(input=>input.value);
}
function updatePlayingCounts(){
 $('selectedCountA').textContent=`${selectedPlayingIds('A').length} selected`;
 $('selectedCountB').textContent=`${selectedPlayingIds('B').length} selected`;
}
function fillReserveSelect(teamKey,lineupIds,selected=''){
 const teamId=$(`team${teamKey}`).value;
 const options=playersFor(teamId).filter(player=>!lineupIds.includes(player.id));
 const select=$(`reserve${teamKey}`);
 select.innerHTML='<option value="">No 12th man selected</option>'+options.map(player=>`<option value="${esc(player.id)}">${esc(player.name)}${player.role==='Wicketkeeper'?' (WK)':''}</option>`).join('');
 select.value=options.some(player=>player.id===selected)?selected:'';
}
function setPlayingCountPreset(teamKey,count){
 const mode=$('matchMode').value;
 const teamId=$(`team${teamKey}`).value;
 const squadSize=playersFor(teamId).length;
 const max=Math.min(15,squadSize);
 if(!max)return toast('Add players to this team first');
 if(count>max){toast(`${team(teamId)?.name||'This team'} has ${squadSize} available player${squadSize===1?'':'s'}; choose up to ${max}`);count=max}
 const input=$(`count${teamKey}`);input.value=count;
 updatePlayingCount(teamKey);
}
function setupTeams(){
 return {a:$('teamA').value,b:$('teamB').value,mode:$('matchMode').value};
}
function renderPlayingPlayerSelectors(){
 const setup=setupTeams(),draft=state.playingDraft,confirmed=state.playingSelection;
 const matchesSetup=value=>value&&value.teamA===setup.a&&value.teamB===setup.b&&value.mode===setup.mode;
 const saved=matchesSetup(draft)?draft:matchesSetup(confirmed)?confirmed:null;
 const rosterA=playersFor(setup.a),rosterB=playersFor(setup.b);
 const defaultCountA=setup.mode==='standard'?Math.min(11,rosterA.length||1):Math.min(11,rosterA.length||1);
 const defaultCountB=setup.mode==='standard'?Math.min(11,rosterB.length||1):Math.min(11,rosterB.length||1);
 const countA=Math.min(15,Math.max(1,Number(saved?.countA)||defaultCountA));
 const countB=Math.min(15,Math.max(1,Number(saved?.countB)||defaultCountB));
 $('countA').value=countA;$('countB').value=countB;
 $('playingTeamAName').textContent=team(setup.a)?.name||'Team A';
 $('playingTeamBName').textContent=team(setup.b)?.name||'Team B';
 const selectedA=Array.isArray(saved?.playersA)?saved.playersA:rosterA.slice(0,countA).map(p=>p.id);
 const selectedB=Array.isArray(saved?.playersB)?saved.playersB:rosterB.slice(0,countB).map(p=>p.id);
 $('playersA').innerHTML=rosterA.length?rosterA.map(p=>`<label class="player-option"><input type="checkbox" class="select-A" value="${esc(p.id)}" ${selectedA.includes(p.id)?'checked':''}>${esc(p.name)}${team(setup.a)?.captainId===p.id?' <small class="captain-badge">C</small>':''}${p.role==='Wicketkeeper'?' <small class="wk-badge">WK</small>':''}</label>`).join(''):'<p class="muted">Add players to this team first.</p>';
 $('playersB').innerHTML=rosterB.length?rosterB.map(p=>`<label class="player-option"><input type="checkbox" class="select-B" value="${esc(p.id)}" ${selectedB.includes(p.id)?'checked':''}>${esc(p.name)}${team(setup.b)?.captainId===p.id?' <small class="captain-badge">C</small>':''}${p.role==='Wicketkeeper'?' <small class="wk-badge">WK</small>':''}</label>`).join(''):'<p class="muted">Add players to this team first.</p>';
 document.querySelectorAll('.select-A,.select-B').forEach(input=>input.onchange=persistPlayingDraft);
 fillReserveSelect('A',selectedA,saved?.reserveA);
 fillReserveSelect('B',selectedB,saved?.reserveB);
 $('reserveA').onchange=persistPlayingDraft;$('reserveB').onchange=persistPlayingDraft;
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
 state.playingDraft={teamA:setup.a,teamB:setup.b,mode:setup.mode,countA:Number($('countA').value),countB:Number($('countB').value),playersA,playersB,reserveA:$('reserveA').value||'',reserveB:$('reserveB').value||''};
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
 state.playingDraft={teamA:setup.a,teamB:setup.b,mode:setup.mode,countA:Number($('countA').value),countB:Number($('countB').value),playersA,playersB,reserveA:$('reserveA').value||'',reserveB:$('reserveB').value||''};
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
 if(playersA.length!==countA||playersB.length!==countB)return toast('Select exactly the number of players shown for both teams.');
 state.playingSelection={teamA:setup.a,teamB:setup.b,mode:setup.mode,countA,countB,playersA,playersB,reserveA:$('reserveA').value||'',reserveB:$('reserveB').value||''};
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
 const targetCount=Number(m.playerCounts?.[teamId])||lineup.length||1;
 $('matchPlayerReplace').options[0].textContent=lineup.length<targetCount?'Add player to lineup':'Choose unused player to replace';
 $('addMatchPlayer').disabled=false;
 $('saveMatchPlayerEdit').disabled=!$('matchPlayerEditSelect').value;
 renderMatchSubstitutionControls(m);
}
function loadMatchPlayerEditForm(){
 const player=state.players.find(item=>item.id===$('matchPlayerEditSelect').value);
 $('matchPlayerEditName').value=player?.name||'';
 $('matchPlayerEditRole').value=player?.role||'All-rounder';
 $('saveMatchPlayerEdit').disabled=!player;
}
function renderMatchSubstitutionControls(m){
 const subTeam=$('matchSubTeam'),wkTeam=$('matchWKTeam');
 if(!subTeam||!wkTeam)return;
 const selectedSub=subTeam.value,selectedWK=wkTeam.value;
 subTeam.innerHTML=m.teams.map(id=>`<option value="${esc(id)}">${esc(team(id)?.name||'Team')}</option>`).join('');
 wkTeam.innerHTML=subTeam.innerHTML;
 subTeam.value=m.teams.includes(selectedSub)?selectedSub:getInnings(m).batting;
 wkTeam.value=m.teams.includes(selectedWK)?selectedWK:getInnings(m).batting;
 const teamId=subTeam.value,lineup=matchLineup(m,teamId),bench=playersFor(teamId).filter(p=>!lineup.includes(p.id));
 const selectedInjured=$('matchInjuredPlayer').value;
 $('matchInjuredPlayer').innerHTML='<option value="">Select player</option>'+lineup.map(id=>`<option value="${esc(id)}">${esc(playerName(id))}</option>`).join('');
 if(lineup.includes(selectedInjured))$('matchInjuredPlayer').value=selectedInjured;
 const reserveId=m.reserves?.[teamId];
 const replacementOptions=bench.filter(p=>p.id!==reserveId).slice();
 if(reserveId&&playersFor(teamId).some(p=>p.id===reserveId))replacementOptions.unshift(state.players.find(p=>p.id===reserveId));
 $('matchReplacementPlayer').innerHTML='<option value="">Select replacement</option>'+replacementOptions.filter(Boolean).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.id===reserveId?' (12th man)':''}</option>`).join('');
 const wkTeamId=wkTeam.value,wkLineup=matchLineup(m,wkTeamId);
 const wkOptions=wkLineup.filter((id,index,all)=>all.indexOf(id)===index);
 $('matchWKPlayer').innerHTML='<option value="">Select player</option>'+wkOptions.map(id=>{const p=state.players.find(item=>item.id===id);return p?`<option value="${esc(p.id)}">${esc(p.name)}${p.role==='Wicketkeeper'?' (WK)':''}</option>`:''}).join('');
 const currentWK=m.wicketkeepers?.[wkTeamId];
 if(wkOptions.includes(currentWK))$('matchWKPlayer').value=currentWK;
}
function saveMatchPlayerEdit(){
 const m=activeMatch(),teamId=$('matchPlayerTeam').value,player=state.players.find(item=>item.id===$('matchPlayerEditSelect').value&&item.teamId===teamId),name=$('matchPlayerEditName').value.trim();
 if(!m||m.status!=='live')return toast('There is no live match to update');
 if(!player)return toast('Select a player from the chosen match team');
 if(!name)return toast('Enter a player name');
 player.name=name;player.role=$('matchPlayerEditRole').value;
 save();renderScorer();toast('Player profile updated; match statistics are unchanged.');
}
function substituteMatchPlayer(){
 const m=activeMatch();
 if(!m||m.status!=='live')return toast('There is no live match to update');
 const teamId=$('matchSubTeam').value,injuredId=$('matchInjuredPlayer').value,replacementId=$('matchReplacementPlayer').value,newName=$('matchReplacementName').value.trim();
 if(!m.teams.includes(teamId))return toast('Select a team in this match');
 if(!injuredId)return toast('Select the injured or replaced player');
 if(replacementId&&newName)return toast('Select a replacement or enter a new name, not both');
 const lineup=matchLineup(m,teamId),index=lineup.indexOf(injuredId);
 if(index<0)return toast('That player is not in the active lineup');
 let replacement;
 if(replacementId){
  replacement=state.players.find(p=>p.id===replacementId&&p.teamId===teamId);
  if(!replacement||lineup.includes(replacement.id))return toast('Choose a replacement who is not already in the active lineup');
 }else{
  if(!newName)return toast('Select a replacement or enter a new player name');
  replacement=playersFor(teamId).find(p=>p.name.trim().toLowerCase()===newName.toLowerCase());
  if(!replacement){
   replacement={id:uid(),name:newName,teamId,role:'Batter',photo:'',stats:{runs:0,balls:0,wickets:0,matches:0}};
   state.players.push(replacement);
  }
  if(lineup.includes(replacement.id))return toast('That player is already in the active lineup');
 }
 lineup[index]=replacement.id;
 m.lineups=m.lineups||{};m.lineups[teamId]=lineup;
 if(m.reserves?.[teamId]===replacementId)m.reserves[teamId]=injuredId;
 if(m.striker===injuredId)m.striker=replacement.id;
 if(m.non===injuredId)m.non=replacement.id;
 if(m.bowler===injuredId)m.bowler=replacement.id;
 const currentInnings=getInnings(m);
 if(Array.isArray(currentInnings.lineup)){
  const inningsIndex=currentInnings.lineup.indexOf(injuredId);
  if(inningsIndex>=0)currentInnings.lineup[inningsIndex]=replacement.id;
 }
 $('matchReplacementName').value='';$('matchReplacementPlayer').value='';
 save();renderScorer();toast(`${playerName(injuredId)} replaced by ${replacement.name}`);
}
function changeMatchWicketkeeper(){
 const m=activeMatch();
 if(!m||m.status!=='live')return toast('There is no live match to update');
 const teamId=$('matchWKTeam').value,playerId=$('matchWKPlayer').value;
 if(!m.teams.includes(teamId))return toast('Select a team in this match');
 if(!playerId)return toast('Select the new wicketkeeper');
 const player=state.players.find(p=>p.id===playerId&&p.teamId===teamId);
 if(!player)return toast('Select a player from this team');
 const lineup=matchLineup(m,teamId);
 if(!lineup.includes(playerId))return toast('Select an active player from the Playing XI');
 const previousWK=m.wicketkeepers?.[teamId];
 if(previousWK&&previousWK!==playerId&&state.players.some(p=>p.id===previousWK&&p.teamId===teamId)){const previous=state.players.find(p=>p.id===previousWK);if(previous.role==='Wicketkeeper')previous.role='All-rounder'}
 player.role='Wicketkeeper';
 m.wicketkeepers=m.wicketkeepers||{};m.wicketkeepers[teamId]=playerId;
 save();renderScorer();toast(`${player.name} set as wicketkeeper`);
}
function addMatchPlayer(){
 const m=activeMatch();
 if(!m||m.status!=='live')return toast('There is no live match to update');
 const teamId=$('matchPlayerTeam').value,replaceId=$('matchPlayerReplace').value,existingId=$('matchExistingPlayer').value,name=$('matchNewPlayerName').value.trim();
 if(!m.teams.includes(teamId))return toast('Select a team in this match');
 if(existingId&&name)return toast('Select an existing player or type a new name, not both');
 const lineup=matchLineup(m,teamId),replaceIndex=replaceId?lineup.indexOf(replaceId):-1;
 if(replaceId&&(replaceIndex<0||matchPlayerHasParticipated(m,replaceId)))return toast('Choose an unused player from the selected team to replace');
 const targetCount=Number(m.playerCounts?.[teamId])||lineup.length||1;
 if(!replaceId&&lineup.length>=targetCount)return toast(`This team already has ${targetCount} selected players. Choose an unused player to replace.`);
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
 if(replaceIndex>=0)lineup[replaceIndex]=player.id;
 else lineup.push(player.id);
 m.lineups=m.lineups||{};
 m.lineups[teamId]=lineup;
 if(m.striker===replaceId)m.striker=player.id;
 if(m.non===replaceId)m.non=player.id;
 if(m.bowler===replaceId)m.bowler=player.id;
 const currentInnings=getInnings(m);
 if(currentInnings.batting===teamId){
  const inningsLineup=Array.isArray(currentInnings.lineup)?currentInnings.lineup:[];
  if(replaceId){
   const inningsIndex=inningsLineup.indexOf(replaceId);
   if(inningsIndex>=0)inningsLineup[inningsIndex]=player.id;
   else currentInnings.lineup=lineup.slice();
  }else if(!inningsLineup.includes(player.id)){
   inningsLineup.push(player.id);currentInnings.lineup=inningsLineup;
  }
 }
 $('matchNewPlayerName').value='';$('matchExistingPlayer').value='';
 save();renderScorer();toast(replaceId?`${player.name} replaced ${playerName(replaceId)} in ${team(teamId)?.name||'the team'}'s lineup.`:`${player.name} added to ${team(teamId)?.name||'the team'}'s lineup.`);
}
function startMatch(){
 const a=$('teamA').value,b=$('teamB').value;if(!a||!b||a===b)return toast('Create/select two different teams');
 const mode=$('matchMode').value,matchFormat=$('matchFormat').value;
 const selection=state.playingSelection;
 const availableA=playersFor(a),availableB=playersFor(b);
 const validSelection=selection&&selection.teamA===a&&selection.teamB===b&&selection.mode===mode;
 const selectedA=validSelection&&Array.isArray(selection.playersA)?selection.playersA.filter(id=>availableA.some(p=>p.id===id)):[];
 const selectedB=validSelection&&Array.isArray(selection.playersB)?selection.playersB.filter(id=>availableB.some(p=>p.id===id)):[];
 const countA=validSelection?Math.max(1,Math.min(15,Number(selection.countA)||1)):(mode==='standard'?Math.min(11,availableA.length||1):1);
 const countB=validSelection?Math.max(1,Math.min(15,Number(selection.countB)||1)):(mode==='standard'?Math.min(11,availableB.length||1):1);
 const lineupA=[...new Set(selectedA)].slice(0,countA);
 const lineupB=[...new Set(selectedB)].slice(0,countB);
 const overs=matchFormat==='Test Match'?null:Number($('matchOvers').value);
 if(overs!==null&&(!Number.isInteger(overs)||overs<1||overs>100))return toast('Overs must be a whole number between 1 and 100');
 const winner=$('tossWinner').value||a, batFirst=$('tossDecision').value==='bat'?winner:(winner===a?b:a);
 const lineups={[a]:lineupA,[b]:lineupB},firstLineup=lineups[batFirst];
 const first=newInnings(batFirst,batFirst===a?b:a,firstLineup,mode);
 first.wicketLimit=Math.max(1,(batFirst===a?countA:countB)-(mode==='standard'?1:0));
 const reserveAId=mode==='standard'?(validSelection&&selection.reserveA?selection.reserveA:$('reserveA').value||''):'';
 const reserveBId=mode==='standard'?(validSelection&&selection.reserveB?selection.reserveB:$('reserveB').value||''):'';
 const reserves={ [a]:availableA.some(p=>p.id===reserveAId)&&!lineupA.includes(reserveAId)?reserveAId:'', [b]:availableB.some(p=>p.id===reserveBId)&&!lineupB.includes(reserveBId)?reserveBId:'' };
 const wicketkeepers={};
 [a,b].forEach(teamId=>{const lineup=lineups[teamId];wicketkeepers[teamId]=lineup.map(id=>state.players.find(p=>p.id===id&&p.role==='Wicketkeeper')?.id).find(Boolean)||null});
 const captains={ [a]:team(a)?.captainId&&lineupA.includes(team(a).captainId)?team(a).captainId:'', [b]:team(b)?.captainId&&lineupB.includes(team(b).captainId)?team(b).captainId:'' };
 const m={id:uid(),title:$('matchTitle').value.trim()||`${team(a).name} vs ${team(b).name}`,format:matchFormat,mode,overs,venue:$('matchVenue').value.trim(),date:$('matchDate').value,teams:[a,b],lineups,reserves,playerCounts:{[a]:countA,[b]:countB},wicketkeepers,captains,seriesId:$('matchSeries').value,toss:{winner,decision:$('tossDecision').value},innings:[first],current:0,status:'live',created:Date.now(),superOver:false,striker:firstLineup[0]||null,non:firstLineup[1]||null,bowler:null,pendingBowler:false,pendingBatterSlot:''};
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
  const bowlerCredited=!['Run Out','Retired Out','Obstructing the Field','Hit Ball Twice'].includes(wicketKind);
  dismissed.dismissalBowlerId=bowlerCredited?m.bowler:null;
  dismissed.dismissalFielderId=needsFielder(wicketKind)?fielderId||null:null;
  if(bw&&bowlerCredited)bw.wickets++;
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
 inn.balls.push({runs,total,type,legal,wicket:wicketKind||'',changeStrike:Boolean(forceStrikeChange),over:Math.floor((inn.legal-(legal?1:0))/6),text,batterId:type==='penalty'?null:strikerId,dismissedBatterId:outId,bowlerId:bw?m.bowler:null,fielderId:wicketKind&&needsFielder(wicketKind)?fielderId||null:null});
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
 return second.runs>first.runs?`${matchTeamName(second.batting)} won by ${Math.max(0,second.wicketLimit-second.wickets)} wicket${second.wicketLimit-second.wickets===1?'':'s'}`:`${matchTeamName(first.batting)} won by ${first.runs-second.runs} run${first.runs-second.runs===1?'':'s'}`;
}
function winningPrediction(m,inn){
 const [teamA,teamB]=m.teams;
 if(m.status==='completed'){
  const first=m.innings[0],second=m.innings[1];
  if(!second||first.runs===second.runs)return {a:50,b:50,message:second?'Match tied':'Result pending'};
  const winner=second.runs>first.runs?second.batting:first.batting;
  return {a:winner===teamA?100:0,b:winner===teamB?100:0,message:`${matchTeamName(winner)} won`};
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
 const nameA=matchTeamName(m.teams[0]),nameB=matchTeamName(m.teams[1]);
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
  return `<tr${active?' class="current-batter"':''}><td>${esc(playerName(id))}${active?' *':''}</td><td>${stats.runs||0}</td><td>${stats.balls||0}</td><td>${stats.fours||0}</td><td>${stats.sixes||0}</td><td>${stats.balls?(stats.runs/stats.balls*100).toFixed(1):'0.0'}</td><td>${esc(dismissalDescription(inn,id,stats))}</td></tr>`;
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
 scorecardSelect.innerHTML=m.innings.map((innings,index)=>`<option value="${index}">${inningsOrdinal(index)} innings — ${esc(matchTeamName(innings.batting))}</option>`).join('');
 scorecardSelect.value=String(scorecardInningsIndex);
 scorecardSelect.onchange=()=>{scorecardInningsIndex=Number(scorecardSelect.value);renderScorecard(m,m.innings[scorecardInningsIndex],scorecardInningsIndex)};
 const inn=getInnings(m),battingTeam=team(inn.batting);
 $('scorerTitle').textContent=m.title;
 $('matchMeta').textContent=`${m.format} • ${modeLabel(m.mode)} • ${m.venue||'Venue not set'} • ${m.date||''}${seriesName(m.seriesId)?' • '+seriesName(m.seriesId):''}`;
 $('inningsLabel').textContent=`${inningsOrdinal(m.current)} Innings • ${battingTeam?.name||'Unknown team'} batting`;
 $('scoreRuns').textContent=inn.runs;$('scoreWkts').textContent=inn.wickets;
 $('oversText').textContent=`${Math.floor(inn.legal/6)}.${inn.legal%6} overs`;
 $('runRate').textContent=inn.legal?(inn.runs/(inn.legal/6)).toFixed(2):'0.00';
 const chasing=m.current>0,target=chasing?m.innings[0].runs+1:null,needed=target===null?null:Math.max(0,target-inn.runs);
 const ballsLeft=m.overs?Math.max(0,m.overs*6-inn.legal):null;
 $('targetText').textContent=chasing?(m.status==='completed'&&needed===0?`Target ${target} reached`:`Target ${target} • Need ${needed}${ballsLeft===null?'':` from ${ballsLeft} balls`}`):'';
 $('requiredRunRate').textContent=chasing&&m.status==='live'&&ballsLeft!==null&&ballsLeft>0?`Required run rate ${(needed/(ballsLeft/6)).toFixed(2)}`:'';
 renderWinningPrediction(m,inn);
 renderMatchOutcome(m);
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
 $('strikerName').textContent=playerNameWithCaptain(m.striker,m);$('nonName').textContent=playerNameWithCaptain(m.non,m);$('bowlerName').textContent=playerNameWithCaptain(m.bowler,m);
 $('strikerStats').textContent=`${bs.runs} (${bs.balls})`;$('nonStats').textContent=`${ns.runs} (${ns.balls})`;$('bowlerStats').textContent=`${bo.wickets}-${bo.runs} • ${Math.floor(bo.legal/6)}.${bo.legal%6}`;
 $('overLog').innerHTML=inn.balls.length?inn.balls.map((x,i)=>`<span class="over-pill">${esc(x.text)}</span>${(i+1)%6===0?'<br>':''}`).join(''):'No deliveries yet.';
 renderLiveScoringSummary(m,inn);
 renderNextPlayerPrompts(m,inn);
 const atBreak=m.status==='live'&&m.inningsBreak,active=m.status==='live'&&!m.inningsBreak;
 $('inningsBreak').classList.toggle('hidden',!atBreak);
 if(atBreak){const first=m.innings[0],defending=team(first.bowling);$('inningsBreakSummary').textContent=`${team(first.batting)?.name||'Team'} finished on ${first.runs}/${first.wickets}. Target for ${defending?.name||'the chasing team'}: ${first.runs+1}.`}
 document.querySelector('.scoring-layout').classList.toggle('hidden',!active);
 $('endInnings').disabled=!active;$('finishMatch').disabled=!active;
 renderScorecard(m,m.innings[scorecardInningsIndex]||inn,scorecardInningsIndex);renderMatchSummary(m);
}
function matchTeamName(id){return team(id)?.name||'Unknown team'}
function inningsOrdinal(index){return `${index+1}${index===0?'st':index===1?'nd':index===2?'rd':'th'}`}
function matchParticipantIds(m){
 const ids=new Set();
 Object.values(m.lineups||{}).forEach(lineup=>{if(Array.isArray(lineup))lineup.forEach(id=>ids.add(id))});
 (m.innings||[]).forEach(inn=>{
  Object.keys(inn.batters||{}).forEach(id=>ids.add(id));
  Object.keys(inn.bowlers||{}).forEach(id=>ids.add(id));
  (inn.balls||[]).forEach(ball=>{if(ball.fielderId)ids.add(ball.fielderId)});
 });
 return [...ids].filter(id=>state.players.some(player=>player.id===id));
}
function playerMatchPerformance(m,playerId){
 const batting=[],bowling=[],fielding={catches:0,stumpings:0,runOuts:0};
 (m.innings||[]).forEach((inn,index)=>{
  const bat=inn.batters?.[playerId];
  if(bat){
   const runs=Number(bat.runs)||0,balls=Number(bat.balls)||0;
   batting.push(`${inningsOrdinal(index)} — ${matchTeamName(inn.batting)}: ${runs} (${balls}), 4s ${Number(bat.fours)||0}, 6s ${Number(bat.sixes)||0}, SR ${balls?(runs/balls*100).toFixed(2):'0.00'}`);
  }
  const bowl=inn.bowlers?.[playerId];
  if(bowl){
   const figures=bowlingFigures(bowl);
   bowling.push(`${inningsOrdinal(index)} — ${matchTeamName(inn.bowling)}: ${figures.overs}-${Number(bowl.maidens)||0}-${Number(bowl.runs)||0}-${Number(bowl.wickets)||0}, Avg ${figures.average}, Econ ${figures.economy}, SR ${figures.strike}`);
  }
  (inn.balls||[]).filter(ball=>ball.fielderId===playerId).forEach(ball=>{
   if(ball.wicket==='Caught')fielding.catches++;
   else if(ball.wicket==='Stumped')fielding.stumpings++;
   else if(ball.wicket==='Run Out')fielding.runOuts++;
  });
 });
 return {batting,bowling,fielding};
}
function playerPerformanceLines(m,playerId){
 const performance=playerMatchPerformance(m,playerId),lines=[
  ...performance.batting.map(line=>`Batting: ${line}`),
  ...performance.bowling.map(line=>`Bowling: ${line}`)
 ];
 const {catches,stumpings,runOuts}=performance.fielding;
 if(catches||stumpings||runOuts)lines.push(`Fielding: ${catches} catches, ${stumpings} stumpings, ${runOuts} run outs`);
 return lines;
}
function inningsOverGroups(inn){
 const overs=new Map();let legalBalls=0;
 (inn.balls||[]).forEach(ball=>{
  const recordedOver=Number(ball.over),over=Number.isInteger(recordedOver)&&recordedOver>=0?recordedOver:Math.floor(legalBalls/6);
  const deliveries=overs.get(over)||[];
  deliveries.push(ball.text||'•');overs.set(over,deliveries);
  const legal=typeof ball.legal==='boolean'?ball.legal:!['wide','noball','penalty'].includes(ball.type);
  if(legal)legalBalls++;
 });
 return overs;
}
function inningsText(inn,index){
 const batters=Object.entries(inn.batters||{}).map(([id,stats])=>{
  const runs=Number(stats.runs)||0,balls=Number(stats.balls)||0;
  return `${playerName(id)} ${runs} (${balls}), 4s ${Number(stats.fours)||0}, 6s ${Number(stats.sixes)||0}, SR ${balls?(runs/balls*100).toFixed(2):'0.00'} — ${dismissalDescription(inn,id,stats)}`;
 });
 const bowlers=Object.entries(inn.bowlers||{}).map(([id,stats])=>{
  const figures=bowlingFigures(stats);
  return `${playerName(id)} ${figures.overs}-${Number(stats.maidens)||0}-${Number(stats.runs)||0}-${Number(stats.wickets)||0}, Avg ${figures.average}, Econ ${figures.economy}, SR ${figures.strike}`;
 });
 const overs=inningsOverGroups(inn);
 return [
  `${inningsOrdinal(index)} Innings — ${matchTeamName(inn.batting)}`,
  `Score: ${inn.runs}/${inn.wickets} (${Math.floor(inn.legal/6)}.${inn.legal%6} overs)`,
  'Batting:',...(batters.length?batters:['No batting figures recorded']),
  'Bowling:',...(bowlers.length?bowlers:['No bowling figures recorded']),
  `Extras: ${Object.entries(inn.extras||{}).map(([name,value])=>`${name} ${Number(value)||0}`).join(', ')||'none'}`,
  `Fall of wickets: ${(inn.fow||[]).map(item=>`${item.w}-${item.r} (${item.overs}), ${playerName(item.player)}`).join('; ')||'none'}`,
  ...(overs.size?['Ball-by-ball:',...Array.from(overs.entries(),([over,balls])=>`Over ${over+1}: ${balls.join(' ')}`)]:[])
 ].join('\n');
}
function summaryText(m){
 const top=(m.innings||[]).flatMap(inn=>Object.entries(inn.batters||{}).map(([id,stats])=>({name:playerName(id),runs:Number(stats.runs)||0}))).sort((a,b)=>b.runs-a.runs)[0];
 const teamNames=(m.teams||[]).map(matchTeamName);
 return [
  `CRICDAIRY — ${m.title}`,
  `${teamNames.join(' vs ')}`,
  `${m.format} • ${modeLabel(m.mode)}${m.date?' • '+m.date:''}${m.venue?' • '+m.venue:''}`,
  m.toss?`Toss: ${matchTeamName(m.toss.winner)} won and chose to ${m.toss.decision==='bat'?'bat':'bowl'}`:'',
  seriesName(m.seriesId)?`Series: ${seriesName(m.seriesId)}`:'',
  ...(m.innings||[]).map(inningsText),
  m.status==='completed'?`Result: ${m.result||'Result pending'}`:'Match in progress',
  m.status==='completed'&&m.playerOfTheMatch?`Player of the Match: ${playerName(m.playerOfTheMatch)}\n${playerPerformanceLines(m,m.playerOfTheMatch).join('\n')}`:'',
  top?`Top scorer: ${top.name} (${top.runs})`:''
 ].filter(Boolean).join('\n\n');
}
function renderMatchSummary(m){
 const innings=(m.innings||[]).map((inn,index)=>`<div class="summary-score"><b>${inningsOrdinal(index)} Innings — ${esc(matchTeamName(inn.batting))}</b><span>${inn.runs}/${inn.wickets}</span><small>${Math.floor(inn.legal/6)}.${inn.legal%6} overs</small></div>`).join('');
 $('matchSummary').innerHTML=`<div class="summary-result"><b>${esc(m.status==='completed'?m.result||'Result pending':'Match in progress')}</b><span>${esc(m.title)}</span>${seriesName(m.seriesId)?`<small>Series: ${esc(seriesName(m.seriesId))}</small>`:''}</div><div class="summary-scores">${innings}</div>`;
 const potm=$('playerOfMatch'),player=m.playerOfTheMatch,candidates=matchParticipantIds(m).sort((a,b)=>playerName(a).localeCompare(playerName(b)));
 potm.classList.toggle('hidden',m.status!=='completed');
 if(m.status!=='completed'){potm.innerHTML='';return}
 potm.innerHTML=`<b>Player of the Match</b><span>${player?esc(playerName(player)):'No player selected'}</span><label>Choose Player of the Match<select id="playerOfMatchSelect"><option value="">No award selected</option>${candidates.map(id=>`<option value="${esc(id)}">${esc(playerName(id))}</option>`).join('')}</select></label><small>Automatically suggested from match performance; you can change the selection.</small><div class="player-match-performance">${playerPerformanceLines(m,player).map(line=>`<p>${esc(line)}</p>`).join('')||'<p>No batting, bowling, or fielding figures recorded.</p>'}</div>`;
 const select=$('playerOfMatchSelect');select.value=player||'';
 select.onchange=async()=>{
  const selected=select.value;
  if(selected&&!candidates.includes(selected))return toast('Choose a player who participated in this match');
  m.playerOfTheMatch=selected||null;
  await save();renderScorer();
 };
}
function renderMatchOutcome(m){
 const completed=m.status==='completed',outcome=$('matchOutcome');
 outcome.classList.toggle('hidden',!completed);
 outcome.innerHTML=completed?`<b>${esc(m.result||'Match completed')}</b><small>Player of the Match: ${esc(m.playerOfTheMatch?playerName(m.playerOfTheMatch):'Not selected')}</small>`:'';
 document.querySelector('#scorer .win-prediction').classList.toggle('hidden',completed);
}
function dismissalDescription(inn,playerId,stats){
 const kind=stats.dismissal;
 if(!kind)return stats.out?'out':'not out';
 const event=(inn.balls||[]).slice().reverse().find(ball=>ball.wicket&&(ball.dismissedBatterId===playerId||(!ball.dismissedBatterId&&ball.batterId===playerId)));
 const bowlerCanBeCredited=!['Run Out','Retired Out','Obstructing the Field','Hit Ball Twice'].includes(kind);
 const bowlerId=bowlerCanBeCredited?(stats.dismissalBowlerId||event?.bowlerId):null;
 const fielderId=stats.dismissalFielderId||event?.fielderId;
 const bowler=bowlerId?playerName(bowlerId):'';
 const fielder=fielderId?playerName(fielderId):'';
 if(kind==='Caught')return `Caught${fielder?` by ${fielder}`:''}${bowler?`, bowled by ${bowler}`:''}`;
 if(kind==='Stumped')return `Stumped${fielder?` by ${fielder}`:''}${bowler?`, bowled by ${bowler}`:''}`;
 if(kind==='Bowled')return bowler?`Bowled by ${bowler}`:kind;
 if(kind==='LBW')return bowler?`LBW to ${bowler}`:kind;
 if(kind==='Run Out')return `Run out${fielder?` by ${fielder}`:''}`;
 return `${kind}${bowler?` (bowler: ${bowler})`:''}`;
}
async function shareMatch(){
 const m=activeMatch();if(!m)return;
 await shareMatchPdf(m);
}
function fillPlayerPick(id,arr,selected){$(id).innerHTML='<option value="">Select player</option>'+arr.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('')}
function playerName(id){return state.players.find(p=>p.id===id)?.name||'Not selected'}
function playerRoleLabel(role){return role==='Wicketkeeper'?'Wicketkeeper (WK)':role||''}
function playerNameWithCaptain(playerId,match){
 const name=playerName(playerId);
 if(!match||!playerId)return name;
 const teamId=match.teams.find(id=>match.lineups?.[id]?.includes(playerId));
 const captainId=match.captains?.[teamId]||team(teamId)?.captainId||'';
 return captainId===playerId?`${name} (C)`:name;
}
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
function inningsBallHistoryMarkup(inn){
 const overs=inningsOverGroups(inn);
 if(!overs.size)return '';
 return `<h3>Ball-by-ball</h3><div class="report-ball-history">${Array.from(overs.entries(),([over,balls])=>`<p><b>Over ${over+1}:</b> ${balls.map(esc).join(' · ')}</p>`).join('')}</div>`;
}
function inningsScorecardMarkup(inn,index){
 const rows=Object.entries(inn.batters||{}).map(([id,stats])=>{
  const runs=Number(stats.runs)||0,balls=Number(stats.balls)||0;
  return `<tr><td>${esc(playerName(id))}</td><td>${runs}</td><td>${balls}</td><td>${Number(stats.fours)||0}</td><td>${Number(stats.sixes)||0}</td><td>${balls?(runs/balls*100).toFixed(1):'0.0'}</td><td>${esc(dismissalDescription(inn,id,stats))}</td></tr>`;
 }).join('');
 const bowlers=Object.entries(inn.bowlers||{}).map(([id,stats])=>{
  const figures=bowlingFigures(stats);
  return `<tr><td>${esc(playerName(id))}</td><td>${figures.overs}</td><td>${Number(stats.maidens)||0}</td><td>${Number(stats.runs)||0}</td><td>${Number(stats.wickets)||0}</td><td>${figures.average}</td><td>${figures.economy}</td><td>${figures.strike}</td></tr>`;
 }).join('');
 const extras=Object.entries(inn.extras||{}).map(([name,value])=>`${name} ${Number(value)||0}`).join(' • ')||'—';
 const wickets=(inn.fow||[]).map(item=>`${item.w}-${item.r} (${item.overs}), ${playerName(item.player)}`).join(', ')||'—';
 return `<section class="report-innings"><h2>${inningsOrdinal(index)} Innings — ${esc(matchTeamName(inn.batting))}</h2><p class="report-innings-total">${Number(inn.runs)||0}/${Number(inn.wickets)||0} (${Math.floor((Number(inn.legal)||0)/6)}.${(Number(inn.legal)||0)%6} overs)</p><div class="table-wrap"><table><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th><th>Dismissal</th></tr></thead><tbody>${rows||'<tr><td colspan="7">No batting data yet</td></tr>'}</tbody></table></div><h3>Bowling</h3><div class="table-wrap"><table><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Avg</th><th>Econ</th><th>SR</th></tr></thead><tbody>${bowlers||'<tr><td colspan="8">No bowling data yet</td></tr>'}</tbody></table></div><p class="report-extras"><b>Extras:</b> ${esc(extras)}<br><b>Fall of wickets:</b> ${esc(wickets)}</p>${inningsBallHistoryMarkup(inn)}</section>`;
}
function renderScorecard(m,inn,index=scorecardInningsIndex){
 $('scorecard').innerHTML=`<div class="report-brand"><img src="${state.settings.profilePhoto||''}" onerror="this.style.display='none'" alt=""><div><b>CRICDAIRY</b><div>${esc(state.settings.profileName||'RAZI SHAH')}</div></div></div>${inningsScorecardMarkup(inn,index)}`;
}
function printableMatchReport(m){
 const teams=(m.teams||[]).map(matchTeamName);
 const metadata=[m.format,modeLabel(m.mode),m.date,m.venue].filter(Boolean).map(esc).join(' • ');
 const toss=m.toss?`<p><b>Toss:</b> ${esc(matchTeamName(m.toss.winner))} won and chose to ${m.toss.decision==='bat'?'bat':'bowl'}</p>`:'';
 const series=seriesName(m.seriesId)?`<p><b>Series:</b> ${esc(seriesName(m.seriesId))}</p>`:'';
 const player=m.playerOfTheMatch;
 const performance=player?playerPerformanceLines(m,player):[];
 const award=player?`<section class="report-award"><h2>Player of the Match — ${esc(playerName(player))}</h2>${performance.map(line=>`<p>${esc(line)}</p>`).join('')||'<p>No batting, bowling, or fielding figures recorded.</p>'}</section>`:'';
 const inningsSummary=(m.innings||[]).map((inn,index)=>{
  const battingRows=Object.entries(inn.batters||{}).map(([id,stats])=>{
   const runs=Number(stats.runs)||0,balls=Number(stats.balls)||0;
   const sr=balls?(runs/balls*100).toFixed(1):'0.0';
   const notOut=stats.out?'':'*';
   return `<div class="summary-batting-row"><span>${esc(playerName(id))}</span><b>${runs}${notOut}</b><b>${balls}</b><b>${Number(stats.fours)||0}</b><b>${Number(stats.sixes)||0}</b><b>${sr}</b><small>${esc(dismissalDescription(inn,id,stats))}</small></div>`;
  }).join('');
  const battingTable=battingRows?`<div class="summary-batting"><div class="summary-batting-row summary-batting-head"><span>Name</span><b>R</b><b>B</b><b>4s</b><b>6s</b><b>SR</b><b>Dismissal</b></div>${battingRows}</div>`:'';
  const bowlingRows=Object.entries(inn.bowlers||{}).map(([id,stats])=>{
   const figures=bowlingFigures(stats);
   return `<div class="summary-bowling-row"><span>${esc(playerName(id))}</span><b>${figures.overs}</b><b>${Number(stats.maidens)||0}</b><b>${Number(stats.runs)||0}</b><b>${Number(stats.wickets)||0}</b><b>${figures.average}</b><b>${figures.economy}</b><b>${figures.strike}</b></div>`;
  }).join('');
  const bowlingTable=bowlingRows?`<div class="summary-bowling"><div class="summary-bowling-row summary-bowling-head"><span>Name</span><b>Overs</b><b>M</b><b>Runs</b><b>Wickets</b><b>Avg</b><b>Econ</b><b>SR</b></div>${bowlingRows}</div>`:'';
  return `<section class="compact-summary-innings"><h2>${esc(matchTeamName(inn.batting))} ${Number(inn.runs)||0}-${Number(inn.wickets)||0} in ${Math.floor((Number(inn.legal)||0)/6)}.${(Number(inn.legal)||0)%6} Overs</h2>${battingTable||'<p>No batting figures recorded</p>'}${bowlingTable||'<p>No bowling figures recorded</p>'}</section>`;
 }).join('');
 const stage=seriesName(m.seriesId)?esc(seriesName(m.seriesId)):esc(m.format||'Match');
 return `<div class="report-document"><div class="report-brand"><b>CRICDAIRY</b><span>${esc(state.settings.profileName||'')}</span></div><h1>${esc(m.title)}</h1><h2 class="report-stage">${stage}</h2><h2 class="report-teams">${esc(teams.join(' vs '))}</h2><p>${metadata}</p>${toss}${inningsSummary}<p class="report-result"><b>${esc(m.status==='completed'?m.result||'Result pending':'Match in progress')}</b></p>${award}<p class="report-footer">Generated by CRICDAIRY</p></div>`;
}
function printMatchReport(){
 const m=activeMatch();if(!m)return;
 $('fullMatchReport').innerHTML=printableMatchReport(m);
 window.print();
}
function pdfTextLines(text,width=88){
 const lines=[];
 String(text||'').replace(/\r/g,'').split('\n').forEach(paragraph=>{
  const words=paragraph.trim().split(/\s+/).filter(Boolean);
  if(!words.length){lines.push('');return}
  let line='';
  words.forEach(word=>{
   if((line+' '+word).trim().length<=width){line=(line+' '+word).trim()}
   else{if(line)lines.push(line);line=word.length>width?word.slice(0,width):word}
  });
  if(line)lines.push(line);
 });
 return lines;
}
function pdfEscape(text){
 return String(text||'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,' ');
}
function createMatchPdfBlob(m){
 const title=m.title||'CRICDAIRY Match';
 const teams=(m.teams||[]).map(matchTeamName);
 const stage=seriesName(m.seriesId)||modeLabel(m.mode)||m.format||'Match';
 const lines=[title,stage,teams.join(' vs '),''];
 (m.innings||[]).forEach((inn,index)=>{
  lines.push(`${matchTeamName(inn.batting)} ${Number(inn.runs)||0}-${Number(inn.wickets)||0} in ${Math.floor((Number(inn.legal)||0)/6)}.${(Number(inn.legal)||0)%6} Overs`);
  lines.push('');
  lines.push('Batting');
  lines.push('Name                     R      B     4s    6s     SR  Dismissal');
  Object.entries(inn.batters||{}).forEach(([id,stats])=>{
   const runs=Number(stats.runs)||0;
   const balls=Number(stats.balls)||0;
   const sr=balls?(runs/balls*100).toFixed(1):'0.0';
   const dismissal=dismissalDescription(inn,id,stats);
   lines.push(`${playerName(id).padEnd(24,' ')}${(String(runs)+(stats.out?'':'*')).padStart(5,' ')}${String(balls).padStart(5,' ')}${String(Number(stats.fours)||0).padStart(6,' ')}${String(Number(stats.sixes)||0).padStart(6,' ')}${sr.padStart(7,' ')}  ${dismissal}`);
  });
  lines.push('');
  lines.push('Bowling');
  if(Object.keys(inn.bowlers||{}).length){
   lines.push('Name                     Overs    M  Runs  Wkts   Avg   Econ     SR');
   Object.entries(inn.bowlers||{}).forEach(([id,stats])=>{
    const figures=bowlingFigures(stats);
    lines.push(`${playerName(id).padEnd(24,' ')}${figures.overs.padStart(6,' ')}${String(Number(stats.maidens)||0).padStart(5,' ')}${String(Number(stats.runs)||0).padStart(6,' ')}${String(Number(stats.wickets)||0).padStart(6,' ')}${figures.average.padStart(7,' ')}${figures.economy.padStart(7,' ')}${figures.strike.padStart(8,' ')}`);
   });
  }
  lines.push('');
 });
 if(m.status==='completed'){
  lines.push(m.result||'Match completed');
  if(m.playerOfTheMatch){
   lines.push(`Player of the Match: ${playerName(m.playerOfTheMatch)}`);
   playerPerformanceLines(m,m.playerOfTheMatch).forEach(line=>lines.push(line));
  }
 }else{
  lines.push('Match in progress');
 }
 const pageLines=44,pages=[];
 for(let i=0;i<lines.length;i+=pageLines)pages.push(lines.slice(i,i+pageLines));
 if(!pages.length)pages=[[]];
 let pdf='%PDF-1.4\n';
 const offsets=[0];
 const objects=[];
 objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
 const kids=pages.map((_,index)=>`${4+index*2} 0 R`).join(' ');
 objects[2]=`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
 objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
 pages.forEach((page,index)=>{
  const pageObject=4+index*2,contentObject=pageObject+1;
  objects[pageObject]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
  const commands=['BT','/F1 10 Tf','45 795 Td','12 TL'];
  page.forEach((line,lineIndex)=>{if(lineIndex===0)commands.push(`(${pdfEscape(line)}) Tj`);else commands.push('T*',`(${pdfEscape(line)}) Tj`)});
  commands.push('ET');
  const stream=commands.join('\n');
  objects[contentObject]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
 });
 for(let id=1;id<objects.length;id++){
  if(!objects[id])continue;
  offsets[id]=pdf.length;
  pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;
 }
 const xref=pdf.length;
 pdf+='xref\n';
 const used=Array.from({length:objects.length},(_,id)=>id).filter(id=>id>0&&objects[id]);
 const maxId=objects.length-1;
 pdf+=`0 ${maxId+1}\n`;
 pdf+='0000000000 65535 f \n';
 for(let id=1;id<=maxId;id++)pdf+=objects[id]?`${String(offsets[id]).padStart(10,'0')} 00000 n \n`:'0000000000 00000 f \n';
 pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([pdf],{type:'application/pdf'});
}
function safeFileName(m){
 const name=(m.title||'CRICDAIRY match').replace(/[<>:"/\\|?*\x00-\x1F]/g,' ').replace(/\s+/g,' ').trim();
 return `${name||'CRICDAIRY match'}.pdf`;
}
function downloadBlob(blob,name){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=name;link.style.display='none';document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function shareMatchPdf(m){
 if(!m)return;
 const blob=createMatchPdfBlob(m),file=new File([blob],safeFileName(m),{type:'application/pdf'});
 try{
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
   await navigator.share({title:`${m.title||'CRICDAIRY match'} — PDF`,text:'Full CRICDAIRY match summary and scorecard',files:[file]});
   toast('Match PDF shared');
   return;
  }
 }catch(error){if(error.name==='AbortError')return}
 downloadBlob(blob,safeFileName(m));toast('PDF downloaded — open it and use Share');
}
function renderAll(){profileMarkup();fillTeamSelects();renderLauncher();renderTeams();renderPlayingPlayerSelectors();renderHistory();renderLive();renderTournaments();fillReportSelect();$('backupInfo').textContent=`${state.matches.length} matches • ${state.teams.length} teams • Auto-saved locally in this browser.`}
function renderLauncher(){
 $('menuResumeMatch').classList.toggle('hidden',!state.matches.some(m=>m.status==='live'));
}
function resumeLatestMatch(){
 const match=state.matches.find(item=>item.status==='live');
 if(!match)return toast('No live match to resume');
 currentId=match.id;page('scorer');toast('Saved match resumed');
}
function matchCard(m,showManagement=false){
 const editMode=editingMatchId===m.id;
 const teamOptions=state.teams.map(item=>`<option value="${esc(item.id)}" ${m.teams[0]===item.id?'selected':''}>${esc(item.name)}</option>`).join('');
 const teamOptionsB=state.teams.map(item=>`<option value="${esc(item.id)}" ${m.teams[1]===item.id?'selected':''}>${esc(item.name)}</option>`).join('');
 const seriesOptions=state.tournaments.map(series=>`<option value="${esc(series.id)}" ${m.seriesId===series.id?'selected':''}>${esc(series.name)}</option>`).join('');
 const editMarkup=editMode?`<div class="match-edit-form"><div class="match-edit-grid"><label>Match title (optional)<input id="editMatchTitle-${esc(m.id)}" value="${esc(m.title)}" maxlength="100"></label><label>Venue (optional)<input id="editMatchVenue-${esc(m.id)}" value="${esc(m.venue||'')}" maxlength="100"></label><label>Team A<select id="editMatchTeamA-${esc(m.id)}">${teamOptions}</select></label><label>Team B<select id="editMatchTeamB-${esc(m.id)}">${teamOptionsB}</select></label><label>Status<select id="editMatchStatus-${esc(m.id)}"><option value="live" ${m.status==='live'?'selected':''}>Live</option><option value="completed" ${m.status==='completed'?'selected':''}>Completed</option></select></label><label>Series<select id="editMatchSeries-${esc(m.id)}"><option value="">No series</option>${seriesOptions}</select></label><label>Match date<input id="editMatchDate-${esc(m.id)}" type="date" value="${esc(m.date||'')}"></label><label>Player of the Match<select id="editMatchPOTM-${esc(m.id)}"><option value="">No player selected</option>${matchParticipantIds(m).map(id=>`<option value="${esc(id)}" ${m.playerOfTheMatch===id?'selected':''}>${esc(playerName(id))}</option>`).join('')}</select></label></div><div class="match-edit-actions"><div class="actions"><button class="primary" data-save-match="${esc(m.id)}">Save changes</button><button class="ghost" data-cancel-match="${esc(m.id)}">Cancel</button></div><button class="danger ghost" data-delete-match="${esc(m.id)}">Delete match</button></div></div>`:'';
 return `<div class="match-card"><div><b>${esc(m.title)}</b><small>${esc(team(m.teams[0])?.name||'')} vs ${esc(team(m.teams[1])?.name||'')} • ${esc(m.format)} • ${esc(m.status)}${seriesName(m.seriesId)?' • '+esc(seriesName(m.seriesId)):''}</small><small>${m.innings.map((i,index)=>`${index===0?'1st':'2nd'} Innings — ${esc(team(i.batting)?.name||'')}: ${i.runs}/${i.wickets}`).join(' | ')}${m.status==='completed'&&m.result?' • '+esc(m.result):''}</small></div><div class="match-actions"><button data-open="${esc(m.id)}" class="ghost">${m.status==='live'?'Open / Resume':'Summary'}</button>${showManagement?`<button data-edit-match="${esc(m.id)}" class="ghost">${editMode?'Close edit':'Edit match'}</button>`:''}<button data-share="${esc(m.id)}" class="ghost">Share PDF</button></div>${showManagement?editMarkup:''}</div>`;
}
function seriesName(id){return state.tournaments.find(s=>s.id===id)?.name||''}
function bindCards(){
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{currentId=b.dataset.open;page('scorer')});
 document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>{currentId=b.dataset.share;shareMatch()});
 document.querySelectorAll('[data-edit-match]').forEach(b=>b.onclick=()=>{editingMatchId=editingMatchId===b.dataset.editMatch?null:b.dataset.editMatch;renderHistory();renderLive();});
 document.querySelectorAll('[data-save-match]').forEach(b=>b.onclick=()=>saveMatchEdit(b.dataset.saveMatch));
 document.querySelectorAll('[data-cancel-match]').forEach(b=>b.onclick=()=>{editingMatchId=null;renderHistory();renderLive();});
 document.querySelectorAll('[data-delete-match]').forEach(b=>b.onclick=()=>deleteMatchEdit(b.dataset.deleteMatch));
}
function saveMatchEdit(matchId){
 const m=state.matches.find(match=>match.id===matchId);
 if(!m)return toast('Match not found');
 const title=$(`editMatchTitle-${m.id}`).value.trim();
 const venue=$(`editMatchVenue-${m.id}`).value.trim();
 const teamA=$(`editMatchTeamA-${m.id}`).value;
 const teamB=$(`editMatchTeamB-${m.id}`).value;
 const status=$(`editMatchStatus-${m.id}`).value;
 const seriesId=$(`editMatchSeries-${m.id}`).value;
 const date=$(`editMatchDate-${m.id}`).value;
 const playerOfTheMatch=$(`editMatchPOTM-${m.id}`).value||null;
 if(!team(teamA)||!team(teamB)||teamA===teamB)return toast('Select two different teams');
 const oldTeams=[...m.teams];
 const teamMap=new Map([[oldTeams[0],teamA],[oldTeams[1],teamB]]);
 m.teams=[teamA,teamB];
 m.lineups=m.lineups||{};
 const oldLineups={...(m.lineups||{})};
 m.lineups={[teamA]:Array.isArray(oldLineups[oldTeams[0]])?[...oldLineups[oldTeams[0]]]:[],[teamB]:Array.isArray(oldLineups[oldTeams[1]])?[...oldLineups[oldTeams[1]]]:[]};
 (m.innings||[]).forEach(inn=>{
  inn.batting=teamMap.get(inn.batting)||inn.batting;
  inn.bowling=teamMap.get(inn.bowling)||inn.bowling;
 });
 m.title=title||`${team(teamA)?.name||'Team'} vs ${team(teamB)?.name||'Team'}`;
 m.venue=venue;m.status=status==='completed'?'completed':'live';m.seriesId=seriesId;m.date=date||m.date||'';
 m.playerOfTheMatch=playerOfTheMatch;
 if(m.status==='completed')m.result=matchResult(m);
 editingMatchId=null;
 save();renderAll();toast('Match updated.');
}
function deleteMatchEdit(matchId){
 const m=state.matches.find(match=>match.id===matchId);
 if(!m)return toast('Match not found');
 if(!confirm(`Delete "${m.title}" from match history? This cannot be undone.`))return;
 state.matches=state.matches.filter(match=>match.id!==matchId);
 if(currentId===matchId)currentId=null;
 editingMatchId=null;
 save();renderAll();toast('Match deleted.');
}
function renderLive(){$('liveMatches').innerHTML=state.matches.filter(m=>m.status==='live').map(m=>matchCard(m,false)).join('')||'No live matches.';bindCards()}
function renderHistory(){const q=($('historySearch')?.value||'').toLowerCase();const arr=state.matches.filter(m=>(m.title+' '+m.venue+' '+m.teams.map(id=>team(id)?.name).join(' ')).toLowerCase().includes(q));$('historyList').innerHTML=arr.map(m=>matchCard(m,true)).join('')||'No matching matches.';bindCards()}
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
 const roster=playersFor(selectedTeam.id).map(player=>`<button type="button" class="player-stat-link" data-player-profile="${esc(player.id)}">${esc(player.name)}${selectedTeam.captainId===player.id?' <span class="captain-badge">C</span>':''}</button> <small>${esc(playerRoleLabel(player.role))}${selectedTeam.captainId===player.id?' • Captain':''}</small>`).join(' • ')||'<span class="muted">No players on this team yet.</span>';
 $('teamProfileTitle').textContent=selectedTeam.name;
 $('teamProfileContent').innerHTML=`<p class="eyebrow">${teamTypeLabel(selectedTeam)}</p><div class="profile-stat-grid"><div class="stat"><small>Played / won / lost</small><strong>${record.played} / ${record.wins} / ${record.losses}</strong></div><div class="stat"><small>Tied / no result</small><strong>${record.ties} / ${record.noResults}</strong></div><div class="stat"><small>Points / win percentage</small><strong>${record.wins*2+record.ties} / ${record.played?((record.wins+record.ties/2)*100/record.played).toFixed(1):'0.0'}%</strong></div><div class="stat"><small>Runs for / against</small><strong>${record.runsFor} / ${record.runsAgainst}</strong></div><div class="stat"><small>Batting / bowling run rate</small><strong>${battingRate} / ${bowlingRate}</strong></div><div class="stat"><small>Highest innings</small><strong>${record.highest}</strong></div></div><div class="panel team-roster"><h3>Players</h3><div>${roster}</div></div><div class="panel table-wrap"><h3>Match history</h3><table><thead><tr><th>Match</th><th>Date</th><th>Scores</th><th>Status</th><th>Result</th></tr></thead><tbody>${matches||'<tr><td colspan="5">No match records yet.</td></tr>'}</tbody></table></div>`;
 document.querySelectorAll('#teamProfileContent [data-player-profile]').forEach(button=>button.onclick=()=>{currentPlayerId=button.dataset.playerProfile;page('playerProfile')});
}
 function setTeamCaptain(teamId,playerId){
  const selectedTeam=team(teamId);
  if(!selectedTeam)return;
  if(playerId&&!playersFor(teamId).some(player=>player.id===playerId))return toast('Select a player from this team or club');
  selectedTeam.captainId=playerId||'';
  save();renderTeams();toast(playerId?`${playerName(playerId)} set as captain`:'Captain removed');
 }
function renderTeams(){
 $('teamList').innerHTML=state.teams.map(t=>`<div class="player-row"><div><button type="button" class="team-stat-link" data-team-profile="${esc(t.id)}">${esc(t.name)}</button><small class="team-type-label">${teamTypeLabel(t)}${t.captainId?' • Captain: '+esc(playerName(t.captainId)):''}</small></div><small>${playersFor(t.id).length} players</small></div>`).join('')||'<p class="muted">No teams added.</p>';
 document.querySelectorAll('#teamList [data-team-profile]').forEach(button=>button.onclick=()=>{currentTeamId=button.dataset.teamProfile;page('teamProfile')});
 const selectedTeamId=$('playerTeam')?.value;
 const selectedTeam=team(selectedTeamId);
 const teamPlayers=selectedTeamId?playersFor(selectedTeamId):[];
 if($('teamPlayerListHeading'))$('teamPlayerListHeading').textContent=selectedTeam?`Players for ${selectedTeam.name}`:'Players';
 const captainSelect=$('teamCaptainSelect');
 if(captainSelect){
  captainSelect.innerHTML='<option value="">No captain selected</option>'+teamPlayers.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  captainSelect.value=selectedTeam?.captainId&&teamPlayers.some(p=>p.id===selectedTeam.captainId)?selectedTeam.captainId:'';
 }
 $('playerList').innerHTML=teamPlayers.map(p=>{
  const initial=(p.name?.trim()[0]||'P').toUpperCase();
  const avatar=p.photo?`<img src="${p.photo}" alt="${esc(p.name)}">`:`<span class="player-avatar-fallback">${esc(initial)}</span>`;
  const captain=selectedTeam?.captainId===p.id;
  return `<div class="player-row editable-player"><div class="player-main">${avatar}<div><b>${esc(p.name)}${captain?' <span class="captain-badge">C</span>':''}</b><small>${esc(team(p.teamId)?.name||'')} • ${esc(playerRoleLabel(p.role))}${captain?' • Captain':''}</small></div></div><div class="player-photo-actions"><button type="button" class="ghost player-photo-change" data-player-id="${p.id}">Change photo</button><button type="button" class="ghost player-photo-remove" data-player-id="${p.id}" ${p.photo?'':'disabled'}>Remove</button><input class="player-photo-input" type="file" accept="image/*" data-player-id="${p.id}" hidden></div></div>`;
 }).join('')||(selectedTeamId?`<p class="muted">No players added for ${esc(selectedTeam?.name||'this team')} yet.</p>`:'<p class="muted">Select a team or club first.</p>');
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
function createTournament(){
 const name=$('tournamentName').value.trim();
 const matchCount=Number($('tournamentMatchCount').value);
 const teamIds=Array.from(document.querySelectorAll('.tournament-team-choice:checked')).map(input=>input.value);
 if(!name)return toast('Enter a series name');
 if(state.tournaments.some(series=>series.name.trim().toLowerCase()===name.toLowerCase()))return toast('A series with this name already exists');
 if(!Number.isInteger(matchCount)||matchCount<1||matchCount>99)return toast('Enter a match count from 1 to 99');
 if(new Set(teamIds).size<2)return toast('Select at least two teams or clubs for the series');
 state.tournaments.push({id:uid(),name,matchCount,teamIds:[...new Set(teamIds)]});
 $('tournamentName').value='';
 $('tournamentMatchCount').value='3';
 document.querySelectorAll('.tournament-team-choice').forEach(input=>input.checked=false);
 save();renderAll();toast('Series created. Start matches from this series card.');
}
function renderTournaments(){
 renderTournamentTeamPicker();
 $('tournamentList').innerHTML=state.tournaments.map(series=>{
  const matches=state.matches.filter(m=>m.seriesId===series.id);
  const completed=matches.filter(m=>m.status==='completed');
  const matchCount=Math.max(1,Number(series.matchCount)||1);
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
  const canStart=(teamIds.length>=2||state.teams.length>=2)&&matches.length<matchCount;
  const recordText=[...records].map(([id,record])=>`${team(id)?.name||'Team'} ${record.wins}W/${record.ties}T`).join(' • ');
  const progressText=`${matches.length}/${matchCount} matches • ${completed.length} completed`;
  const editMode=editingTournamentId===series.id;
  const editTeamOptions=state.teams.map(item=>`<label class="series-team-option"><input type="checkbox" class="edit-tournament-team-choice" value="${esc(item.id)}" ${teamIds.includes(item.id)?'checked':''}><span>${esc(item.name)}<small>${teamTypeLabel(item)}</small></span></label>`).join('');
  const editMarkup=editMode?`<div class="series-edit-form"><label>Series name<input id="editTournamentName" value="${esc(series.name)}" maxlength="80"></label><label>Number of matches<input id="editTournamentMatchCount" type="number" min="1" max="99" value="${matchCount}"></label><div class="series-edit-teams"><b>Teams / clubs</b><div class="tournament-team-picker">${editTeamOptions||'<p class="muted">Add teams or clubs first.</p>'}</div></div><div class="series-edit-actions"><div class="actions"><button class="primary" data-save-series="${esc(series.id)}">Save changes</button><button class="ghost" data-cancel-series="${esc(series.id)}">Cancel</button></div><button class="danger ghost" data-delete-series="${esc(series.id)}">Delete series</button></div></div>`:'';
  return `<div class="series-card"><div class="section-head"><div><b>🏆 ${esc(series.name)}</b><small>${progressText}</small><small>${teamIds.length} team${teamIds.length===1?'':'s'} / club${teamIds.length===1?'':'s'}: ${participantText}</small></div><div class="series-actions"><div class="series-record">${esc(recordText||'No results yet')}</div><div class="series-buttons"><button class="ghost" data-edit-series="${esc(series.id)}">${editMode?'Close edit':'Edit series'}</button><button class="primary" data-start-series="${esc(series.id)}" ${canStart?'':'disabled'}>${matches.length>=matchCount?'Series complete':'Start match'}</button></div></div></div>${editMarkup}${matches.length?matches.map(m=>`<div class="series-match"><span>${esc(m.title)}</span><small>${esc(m.status)}${m.result?' • '+esc(m.result):''}</small><button class="ghost" data-open="${esc(m.id)}">Open</button></div>`).join(''):'<p class="muted">No matches linked yet.</p>'}</div>`;
 }).join('')||'<p class="muted">No series created yet.</p>';
 document.querySelectorAll('[data-start-series]').forEach(button=>button.onclick=()=>startSeriesMatch(button.dataset.startSeries));
 document.querySelectorAll('[data-edit-series]').forEach(button=>button.onclick=()=>{editingTournamentId=editingTournamentId===button.dataset.editSeries?null:button.dataset.editSeries;renderTournaments()});
 document.querySelectorAll('[data-delete-series]').forEach(button=>button.onclick=()=>deleteTournament(button.dataset.deleteSeries));
 document.querySelectorAll('[data-save-series]').forEach(button=>button.onclick=()=>saveTournamentEdit(button.dataset.saveSeries));
 document.querySelectorAll('[data-cancel-series]').forEach(button=>button.onclick=()=>{editingTournamentId=null;renderTournaments()});
 bindCards();
 $('pointsTable').innerHTML='';
}
function deleteTournament(seriesId){
 const series=state.tournaments.find(item=>item.id===seriesId);
 if(!series)return toast('Series not found');
 const linkedMatches=state.matches.filter(match=>match.seriesId===seriesId);
 const matchText=linkedMatches.length?` ${linkedMatches.length} linked match${linkedMatches.length===1?'':'es'} will remain in history without this series.`:'';
 if(!confirm(`Delete "${series.name}"?${matchText}`))return;
 state.tournaments=state.tournaments.filter(item=>item.id!==seriesId);
 linkedMatches.forEach(match=>{match.seriesId=''});
 if(editingTournamentId===seriesId)editingTournamentId=null;
 save();renderAll();fillTeamSelects();toast('Series deleted. Linked matches remain in history.');
}
function saveTournamentEdit(seriesId){
 const series=state.tournaments.find(item=>item.id===seriesId);
 if(!series)return toast('Series not found');
 const name=$('editTournamentName').value.trim();
 const matchCount=Number($('editTournamentMatchCount').value);
 const teamIds=Array.from(document.querySelectorAll('.edit-tournament-team-choice:checked')).map(input=>input.value);
 if(!name)return toast('Enter a series name');
 if(state.tournaments.some(item=>item.id!==seriesId&&item.name.trim().toLowerCase()===name.toLowerCase()))return toast('A series with this name already exists');
 if(!Number.isInteger(matchCount)||matchCount<1||matchCount>99)return toast('Enter a match count from 1 to 99');
 if(new Set(teamIds).size<2)return toast('Select at least two teams or clubs');
 series.name=name;
 series.matchCount=matchCount;
 series.teamIds=[...new Set(teamIds)];
 editingTournamentId=null;
 save();renderAll();toast('Series updated.');
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