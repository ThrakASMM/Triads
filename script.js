// =======================================================
// Ear Training — Triades (build monolithe complet)
// Guillaume Estace / ASMM — 2025-08-24
// =======================================================
// Features majeures
// - Entraînement & Test (10 questions)
// - Modes: sequential (notes séparées) / simultaneous (accord)
// - Voicing: close / open / both (both => boutons d’écoute + select de réponse Close/Open)
// - Sélection des triades (Maj, Min, Aug, Sus4, Dim, Sus#4, Susb2) en Training ET Test
// - Génération audio bornée (registre évite les aigus), "open" = note du milieu à l’octave supérieure
// - Scoring examen 2/1/0 (≤60s), "gaming score" = 100 + bonus temps, × multiplicateur difficulté
// - "Passer" (cliquer "Question suivante" sans valider) = 0 pt
// - Scoreboard Top 5 en localStorage (affiché en fin de test)
// - UX: réécoute après partielle/incorrecte ; triade Aug = pas de renversement affiché
// - Correctifs: Sus#4, Susb2 (PF/R1/R2) cohérents + fondamentale en PF/R1/R2 (hors Aug)

// =======================================================
// Boot
document.addEventListener('DOMContentLoaded', () => {

  // ---------- 1) Constantes globales ----------
  const TIMINGS = {
    test:       { preDelayMs: 1500, playbackMs: 4000, noteGapMs: 0 },
    sequential: { preDelayMs: 800,  playbackMs: 2200, noteGapMs: 600 },
    training:   { preDelayMs: 400,  playbackMs: 5000, noteGapMs: 0 }
  };
  const EXAM_TIME_LIMIT_S = 60;        // au-delà → 0 pt examen
  const TOTAL_QUESTIONS_DEFAULT = 10;

  // Images fin de test (placer les fichiers dans /img/)
  const SCORE_IMG_PATH = 'img';
  const SCORE_IMG = {
    success: `${SCORE_IMG_PATH}/success.png`,
    ok:      `${SCORE_IMG_PATH}/ok.png`,
    fail:    `${SCORE_IMG_PATH}/fail.png`,
  };

  // Registre audio (borne grave-aigu)
  const AUDIO_MIN_OCT = 2; // C2…B4
  const AUDIO_MAX_OCT = 4;
  const MAX_TOP_OCT   = 5; // clamp ultime

  // ---------- 2) Raccourcis DOM ----------
  const $ = (id)=>document.getElementById(id);

  // HUD / conteneurs
  const progressDiv = $('progress');
  const scoreDiv    = $('score');
  const timingDiv   = $('timing');
  const menu        = $('menu');
  const game        = $('game');
  const questionDiv = $('question');
  const validationDiv = $('validation-message');
  const resultDiv   = $('result');

  // Boutons principal
  const startBtn      = $('start-game');
  const backBtn       = $('back-to-menu');
  const restartBtn    = $('restart-test');
  const nextBtn       = $('next-question');

  // Audio (réécoute)
  const replayBothBtn  = $('replay-single-and-triad');
  const replayTriadBtn = $('replay-triad-only');
  const forceCloseBtn  = $('force-close');
  const forceOpenBtn   = $('force-open');

  // Réponse
  const submitBtn   = $('submit-answer');
  const triadSelect       = $('triad-select');
  const inversionSelect   = $('inversion-select');
  const fundamentalSelect = $('fundamental-select');
  const voicingAnswerSelect = $('voicing-select'); // visible si voicing = both

  // Sélecteur triades (menu)
  const triadPicker        = $('triad-picker');
  const triadChecksWrap    = $('triad-checks');
  const triadWarning       = $('triad-warning');
  const selectAllBtnTriads = $('select-all-triads');
  const deselectAllBtnTriads = $('deselect-all-triads');
  const selectedCountEl    = $('selected-count');

  // Radios options
  const getGametype     = () => document.querySelector('[name="gametype"]:checked')?.value || 'training';
  const getSelectedMode = () => document.querySelector('[name="mode"]:checked')?.value || 'sequential';
  const getVoicing      = () => document.querySelector('[name="voicing"]:checked')?.value || 'close';

  // ---------- 3) Données musicales ----------
  const noteMap = { 'C':0,'Db':1,'D':2,'Eb':3,'E':4,'F':5,'Gb':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11 };
  const reverseNoteMap = Object.keys(noteMap).reduce((acc, k) => (acc[noteMap[k]] = k, acc), {});
  const enharm = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };

  const ALL_TRIADS = ['Maj','Min','Aug','Sus4','Dim','Sus#4','Susb2'];
  const INVERSIONS = ['Root Position','First Inversion','Second Inversion']; // PF/R1/R2 mais on masque pour Aug côté UI

  // Structures des triades fermées (intervals en demi-tons vers l’aigu)
  const triadStructuresMaster = [
    // Position fondamentale
    { type:'Maj',   intervals:[4,3], inversion:'PF' },
    { type:'Min',   intervals:[3,4], inversion:'PF' },
    { type:'Aug',   intervals:[4,4], inversion:'PF' }, // renversements masqués en UI
    { type:'Sus4',  intervals:[5,2], inversion:'PF' },
    { type:'Dim',   intervals:[3,3], inversion:'PF' },

    // 1er renversement
    { type:'Maj',   intervals:[3,5], inversion:'R1' },
    { type:'Min',   intervals:[4,5], inversion:'R1' },
    { type:'Sus4',  intervals:[2,5], inversion:'R1' },
    { type:'Dim',   intervals:[3,6], inversion:'R1' },

    // 2e renversement
    { type:'Maj',   intervals:[5,4], inversion:'R2' },
    { type:'Min',   intervals:[5,3], inversion:'R2' },
    { type:'Sus4',  intervals:[5,5], inversion:'R2' },
    { type:'Dim',   intervals:[6,3], inversion:'R2' },

    // Nouveaux types (CORRIGÉS) — Sus#4 et Susb2
    { type:'Sus#4', intervals:[6,1], inversion:'PF' },
    { type:'Sus#4', intervals:[1,5], inversion:'R1' },
    { type:'Sus#4', intervals:[5,6], inversion:'R2' },

    { type:'Susb2', intervals:[1,6], inversion:'PF' },
    { type:'Susb2', intervals:[6,5], inversion:'R1' },
    { type:'Susb2', intervals:[5,1], inversion:'R2' },
  ];

  // ---------- 4) Audio assets ----------
  const notes = {};
  for (let o = AUDIO_MIN_OCT; o <= AUDIO_MAX_OCT; o++) {
    Object.keys(noteMap).forEach(n => notes[`${n}${o}`] = `audio/${n}${o}.mp3`);
  }
  let preloadedSounds = {};

  // ---------- 5) État du jeu ----------
  let config = {
    gametype: 'training',   // training | test
    mode:     'sequential', // sequential | simultaneous
    voicing:  'close',      // close | open | both
    allowedTriads: ALL_TRIADS.slice(),
    preDelayMs: TIMINGS.training.preDelayMs,
    playbackMs: TIMINGS.training.playbackMs,
    noteGapMs:  TIMINGS.training.noteGapMs,
    totalQuestions: TOTAL_QUESTIONS_DEFAULT,
  };

  let triadPool = triadStructuresMaster; // filtré par allowedTriads

  // Question courante
  let currentClosed = null;
  let currentOpen   = null;
  let currentNotes  = null;
  let playedVoicing = 'close';

  let firstNotePlayed = null;
  let correctAnswer = '';
  let questionIndex = -1;

  // Scores
  let scoreTotal = 0;                        // "gaming score"
  let startTime = null, questionStartTime = null, hudTimerActive = false;
  let answeredThisQuestion = false;

  let examPointsByIndex = [];  // 0/1/2 (ou null si "pas encore répondu")
  let gamePointsByIndex = [];

  // =======================================================
  // 6) Utilitaires
  // =======================================================
  const getRandom = (arr) => arr[Math.floor(Math.random()*arr.length)];

  function enh(note){
    const name = note.slice(0,-1);
    const oct  = note.slice(-1);
    return enharm[name]?`${name}/${enharm[name]}${oct}`:note;
  }
  function splitNote(n){ return { idx: noteMap[n.slice(0,-1)], oct: parseInt(n.slice(-1),10) }; }
  function makeNote(idx, oct){ return `${reverseNoteMap[(idx+12)%12]}${oct}`; }
  function midiIndex(n){ const s=splitNote(n); return s.idx + 12*s.oct; }

  function getRandomBaseNote(){
    // on évite le tout-haut, on laisse 1 octave de marge
    const startOctave = AUDIO_MIN_OCT;
    const endOctave   = Math.max(AUDIO_MIN_OCT, AUDIO_MAX_OCT - 1);
    const oct = Math.floor(Math.random() * (endOctave - startOctave + 1)) + startOctave;
    const name = getRandom(Object.keys(noteMap));
    return `${name}${oct}`;
  }

  // Génération triade fermée + option "open" (monter la note du milieu d'1 octave)
  function generateTriadFromStructure(baseNote, structure, openVoicing=false){
    const base = splitNote(baseNote);
    let arr = [ baseNote ];
    let curIdx = base.idx;
    let curOct = base.oct;

    // Construire en montant
    structure.intervals.forEach(semi=>{
      const next=(curIdx+semi)%12;
      if(next<curIdx) curOct = Math.min(AUDIO_MAX_OCT, curOct+1);
      arr.push(makeNote(next, curOct));
      curIdx = next;
    });

    // Range grave→aigu
    arr.sort((a,b)=>midiIndex(a)-midiIndex(b));

    // Contraindre sur ~1 octave (éviter grands écarts)
    const minOct = splitNote(arr[0]).oct;
    const maxAllowed = minOct + 1;
    arr = arr.map(n=>{
      let s = splitNote(n);
      if (s.oct > maxAllowed) s.oct = maxAllowed;
      return makeNote(s.idx, s.oct);
    });

    // OPEN: monter la note du milieu d'une octave (clamp MAX_TOP_OCT)
    if (openVoicing) {
      let mid = splitNote(arr[1]);
      mid.oct = Math.min(MAX_TOP_OCT, mid.oct + 1);
      arr[1] = makeNote(mid.idx, mid.oct);
      arr.sort((a,b)=>midiIndex(a)-midiIndex(b));
    }

    // Clamp ultime en haut
    const top = splitNote(arr[2]);
    if (top.oct > MAX_TOP_OCT) arr[2] = makeNote(top.idx, MAX_TOP_OCT);

    return arr;
  }

  // Analyse d'une triade (array triée grave→aigu), renvoie triadType + inversion + fondamentale
  function analyzeTriad(arr){
    const [n1,n2,n3]=arr;
    const i1=(noteMap[n2.slice(0,-1)]-noteMap[n1.slice(0,-1)]+12)%12;
    const i2=(noteMap[n3.slice(0,-1)]-noteMap[n2.slice(0,-1)]+12)%12;

    let triadType='', inversion='', fundamental=n1.slice(0,-1);

    // Maj / Min / Aug / Sus4 / Dim
    if (i1===4 && i2===3) { triadType='Maj'; inversion='PF'; }
    else if (i1===3 && i2===4) { triadType='Min'; inversion='PF'; }
    else if (i1===4 && i2===4) { triadType='Aug'; inversion='PF'; }           // UI masque renversements
    else if (i1===5 && i2===2) { triadType='Sus4'; inversion='PF'; }
    else if (i1===3 && i2===3) { triadType='Dim'; inversion='PF'; }

    else if (i1===3 && i2===5) { triadType='Maj'; inversion='R1'; fundamental=n3.slice(0,-1); }
    else if (i1===4 && i2===5) { triadType='Min'; inversion='R1'; fundamental=n3.slice(0,-1); }
    else if (i1===2 && i2===5) { triadType='Sus4'; inversion='R1'; fundamental=n3.slice(0,-1); }
    else if (i1===3 && i2===6) { triadType='Dim'; inversion='R1'; fundamental=n3.slice(0,-1); }

    else if (i1===5 && i2===4) { triadType='Maj'; inversion='R2'; fundamental=n2.slice(0,-1); }
    else if (i1===5 && i2===3) { triadType='Min'; inversion='R2'; fundamental=n2.slice(0,-1); }
    else if (i1===5 && i2===5) { triadType='Sus4'; inversion='R2'; fundamental=n2.slice(0,-1); }
    else if (i1===6 && i2===3) { triadType='Dim'; inversion='R2'; fundamental=n2.slice(0,-1); }

    // Sus#4 (1 #4 5) — corrigé
    else if (i1===6 && i2===1) { triadType='Sus#4'; inversion='PF'; }
    else if (i1===1 && i2===5) { triadType='Sus#4'; inversion='R1'; fundamental=n3.slice(0,-1); }
    else if (i1===5 && i2===6) { triadType='Sus#4'; inversion='R2'; fundamental=n2.slice(0,-1); }

    // Susb2 (1 b2 5) — corrigé
    else if (i1===1 && i2===6) { triadType='Susb2'; inversion='PF'; }
    else if (i1===6 && i2===5) { triadType='Susb2'; inversion='R1'; fundamental=n3.slice(0,-1); }
    else if (i1===5 && i2===1) { triadType='Susb2'; inversion='R2'; fundamental=n2.slice(0,-1); }

    return { triadType, inversion, fundamental };
  }

  // Parse chaîne "CMinR1" -> {fund:'C', triad:'Min', inv:'R1'}
  function parseAnswer(str){
    const inv = str.endsWith('PF') ? 'PF' : (str.endsWith('R1') ? 'R1' : 'R2');
    const body = str.slice(0, -inv.length);
    const types = ['Maj','Min','Aug','Sus4','Dim','Sus#4','Susb2'];
    let triad = '', tonic = '';
    for (const t of types){
      if (body.endsWith(t)){ triad = t; tonic = body.slice(0, body.length - t.length); break; }
    }
    return { fund: tonic, triad, inv };
  }

  // =======================================================
  // 7) Scoring "gaming"
  // =======================================================
  function getDifficultyMultiplier(cfg){
    const triadBoost = 1 + 0.10 * Math.max(0, (cfg.allowedTriads?.length||1) - 1); // +10% par triade supplémentaire
    const modeBoost  = (cfg.mode==='sequential') ? 1.00 : 1.20;                     // simultané = +20%
    const voicingBoost = (cfg.voicing==='open') ? 1.15 : (cfg.voicing==='both' ? 1.10 : 1.00);
    return Math.min(2.20, Number((triadBoost * modeBoost * voicingBoost).toFixed(2)));
  }
  function getTimeBonus(s){
    const t=Math.max(0,s);
    if (t<=1.5) return 150;
    if (t<=3)   return 120;
    if (t<=5)   return 100;
    if (t<=8)   return 80;
    if (t<=12)  return 60;
    if (t<=18)  return 45;
    if (t<=25)  return 35;
    if (t<=35)  return 25;
    if (t<=45)  return 15;
    return 5; // jusque 60s
  }
  function computeQuestionPoints(ok, s, cfg){
    if(!ok) return 0;
    return Math.round((100 + getTimeBonus(s)) * getDifficultyMultiplier(cfg));
  }

  // =======================================================
  // 8) Construction sélecteur triades (menu)
  // =======================================================
  function buildTriadChecks(){
    if (!triadChecksWrap) return;
    triadChecksWrap.innerHTML='';
    ALL_TRIADS.forEach(label=>{
      const l=document.createElement('label');
      l.style.display='inline-flex'; l.style.alignItems='center'; l.style.gap='8px'; l.style.marginRight='10px';
      const c=document.createElement('input'); c.type='checkbox'; c.value=label; c.checked=true;
      c.addEventListener('change',()=>{ updateSelectedCount(); applySettings(); });
      l.appendChild(c); l.append(label);
      triadChecksWrap.appendChild(l);
    });
    updateSelectedCount();
  }
  function updateSelectedCount(){
    if (!selectedCountEl) return;
    const n = triadChecksWrap.querySelectorAll('input[type="checkbox"]:checked').length;
    selectedCountEl.textContent = `${n} sélectionnée${n>1?'s':''}`;
  }
  buildTriadChecks();

  if (selectAllBtnTriads)
    selectAllBtnTriads.onclick = ()=>{ triadChecksWrap.querySelectorAll('input').forEach(c=>c.checked=true);  updateSelectedCount(); applySettings(); };
  if (deselectAllBtnTriads)
    deselectAllBtnTriads.onclick = ()=>{ triadChecksWrap.querySelectorAll('input').forEach(c=>c.checked=false); updateSelectedCount(); applySettings(); };

  // =======================================================
  // 9) Application des réglages (menus radios)
  // =======================================================
  function applySettings(){
    config.gametype = getGametype();
    config.mode     = getSelectedMode();
    config.voicing  = getVoicing();

    triadPicker && (triadPicker.style.display = 'block');

    const checked = triadChecksWrap
      ? Array.from(triadChecksWrap.querySelectorAll('input:checked')).map(c=>c.value)
      : ALL_TRIADS.slice();
    config.allowedTriads = checked;
    triadWarning && (triadWarning.style.display = checked.length ? 'none' : 'block');

    const t = (config.gametype==='training') ? TIMINGS.training :
              (config.mode==='sequential' ? TIMINGS.sequential : TIMINGS.test);
    config.preDelayMs = t.preDelayMs;
    config.playbackMs = t.playbackMs;
    config.noteGapMs  = t.noteGapMs || 0;
    config.totalQuestions = TOTAL_QUESTIONS_DEFAULT;

    triadPool = triadStructuresMaster.filter(s => config.allowedTriads.includes(s.type));

    // Affichages conditionnels
    const showForce = (config.voicing === 'both');
    if (forceCloseBtn) forceCloseBtn.style.display = showForce ? 'inline-block' : 'none';
    if (forceOpenBtn)  forceOpenBtn.style.display  = showForce ? 'inline-block' : 'none';
    if (voicingAnswerSelect) voicingAnswerSelect.style.display = showForce ? 'block' : 'none';
  }
  document.querySelectorAll('[name="gametype"]').forEach(r=>r.addEventListener('change', applySettings));
  document.querySelectorAll('[name="mode"]').forEach(r=>r.addEventListener('change', applySettings));
  document.querySelectorAll('[name="voicing"]').forEach(r=>r.addEventListener('change', applySettings));
  applySettings();

  // =======================================================
  // 10) Handlers principaux
  // =======================================================
  if (startBtn)   startBtn.onclick   = startGame;
  if (backBtn)    backBtn.onclick    = ()=>backToMenu();
  if (restartBtn) restartBtn.onclick = startGame;

  if (nextBtn) nextBtn.onclick = () => {
    // "Passer" = 0 pt si aucune validation n’a été envoyée
    if (!answeredThisQuestion && questionIndex >= 0 && questionIndex < config.totalQuestions) {
      examPointsByIndex[questionIndex] = 0;
      gamePointsByIndex[questionIndex] = 0;
      answeredThisQuestion = true;
    }
    advance();
  };

  if (replayBothBtn)  replayBothBtn.onclick  = replaySingleThenTriad;
  if (replayTriadBtn) replayTriadBtn.onclick = playTriadNow;
  if (forceCloseBtn)  forceCloseBtn.onclick  = () => playSpecificVoicing('close');
  if (forceOpenBtn)   forceOpenBtn.onclick   = () => playSpecificVoicing('open');
  if (submitBtn)      submitBtn.onclick      = () => validateAnswer();

  // =======================================================
  // 11) Lancement / navigation
  // =======================================================
  async function startGame(){
    applySettings();
    if (!config.allowedTriads.length){ triadWarning && (triadWarning.style.display='block'); return; }

    if (menu) menu.style.display='none';
    if (game) game.style.display='block';
    if (resultDiv) resultDiv.textContent='';
    if (validationDiv) validationDiv.textContent='';

    // reset état
    questionIndex = -1;
    scoreTotal    = 0;
    answeredThisQuestion = false;
    examPointsByIndex = new Array(config.totalQuestions).fill(null);
    gamePointsByIndex = new Array(config.totalQuestions).fill(0);

    buildSelects();

    startTime=Date.now(); hudTimerActive=true; tickHudTimer();
    await preloadSounds().catch(()=>{});
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(_){}
    advance();
  }

  function backToMenu(){
    stopAllSounds(); hudTimerActive=false;
    if (game) game.style.display='none';
    if (menu) menu.style.display='block';
  }

  function advance(){
    questionIndex += 1;
    if (questionIndex >= config.totalQuestions) { endGame(); return; }
    nextQuestion();
  }

  function nextQuestion(){
    validationDiv && (validationDiv.textContent='');
    resultDiv && (resultDiv.textContent='');
    nextBtn && (nextBtn.disabled=false);

    answeredThisQuestion = false;
    submitBtn && (submitBtn.disabled = false);

    // reset selects
    triadSelect && (triadSelect.selectedIndex = 0);
    inversionSelect && (inversionSelect.selectedIndex = 0);
    fundamentalSelect && (fundamentalSelect.selectedIndex = 0);
    voicingAnswerSelect && (voicingAnswerSelect.selectedIndex = 0);

    // Aug = masque inversion
    if (inversionSelect && triadSelect) {
      inversionSelect.style.display = (triadSelect.value==='Aug') ? 'none' : 'block';
    }
    // voicing select seulement si config.voicing = both
    if (voicingAnswerSelect) {
      voicingAnswerSelect.style.display = (config.voicing === 'both') ? 'block' : 'none';
    }

    updateHud();
    generateQuestion();
  }

  // Construction des selects de réponse
  function buildSelects(){
    if (!triadSelect || !inversionSelect || !fundamentalSelect) return;

    // Triad type
    triadSelect.innerHTML = '';
    (config.allowedTriads.length?config.allowedTriads:ALL_TRIADS).forEach(t=>{
      const o=document.createElement('option'); o.value=t; o.textContent=t; triadSelect.appendChild(o);
    });

    // Inversions
    inversionSelect.innerHTML = '';
    INVERSIONS.forEach(inv=>{ const o=document.createElement('option'); o.value=inv; o.textContent=inv; inversionSelect.appendChild(o); });

    // Fondamentales
    fundamentalSelect.innerHTML = '';
    Object.keys(noteMap).forEach(n=>{
      const o=document.createElement('option'); const e=enharm[n]; o.value=n; o.textContent = e?`${n}/${e}`:n; fundamentalSelect.appendChild(o);
    });

    // Masquer inversion pour Aug
    triadSelect.addEventListener('change', ()=>{
      inversionSelect.style.display = (triadSelect.value==='Aug') ? 'none' : 'block';
    });

    triadSelect.selectedIndex = 0;
    inversionSelect.selectedIndex = 0;
    fundamentalSelect.selectedIndex = 0;

    // 4e select (voicing) si both
    if (voicingAnswerSelect){
      voicingAnswerSelect.innerHTML = '';
      ['close','open'].forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
        voicingAnswerSelect.appendChild(o);
      });
      voicingAnswerSelect.style.display = (config.voicing === 'both') ? 'block' : 'none';
    }

    inversionSelect.style.display = (triadSelect.value==='Aug') ? 'none' : 'block';
  }

  // =======================================================
  // 12) Génération + Audio
  // =======================================================
  function generateQuestion(){
    const structure = getRandom(triadPool);
    const baseNote  = getRandomBaseNote();

    currentClosed = generateTriadFromStructure(baseNote, structure, false);
    currentOpen   = generateTriadFromStructure(baseNote, structure, true);

    if (config.voicing === 'open') { currentNotes = currentOpen; playedVoicing='open'; }
    else if (config.voicing === 'close') { currentNotes = currentClosed; playedVoicing='close'; }
    else { // both → choix aléatoire pour la question
      const openThis = Math.random() < 0.5;
      currentNotes = openThis ? currentOpen : currentClosed;
      playedVoicing = openThis ? 'open' : 'close';
    }

    const a = analyzeTriad(currentNotes);
    correctAnswer = `${a.fundamental}${a.triadType}${a.inversion}`;

    // Note repère jouée en premier (aléatoire)
    firstNotePlayed = currentNotes[Math.floor(Math.random()*3)];

    // IMPORTANT: ne pas afficher le voicing pour éviter de donner la réponse
    questionDiv && (questionDiv.textContent = `Note jouée : ${enh(firstNotePlayed)}`);

    questionStartTime = Date.now();
    replaySingleThenTriad();
  }

  function preloadSounds(){
    const promises=[];
    for(let o=AUDIO_MIN_OCT;o<=AUDIO_MAX_OCT;o++){
      for(const n of Object.keys(noteMap)){
        const key=`${n}${o}`, a=new Audio(notes[key]);
        preloadedSounds[key]=a;
        promises.push(new Promise(res=>{
          a.addEventListener('canplaythrough',()=>res(),{once:true});
          a.addEventListener('error',()=>res(),{once:true}); // on résout quand même
        }));
      }
    }
    return Promise.all(promises);
  }

  function stopAllSounds(){ Object.values(preloadedSounds).forEach(a=>{ try{a.pause(); a.currentTime=0; a.volume=1;}catch(_){}}); }

  function replaySingleThenTriad(){
    stopAllSounds(); if(!currentNotes||!firstNotePlayed) return;
    const a = preloadedSounds[firstNotePlayed]; if(!a) return;
    try{
      a.currentTime=0;
      a.play().then(()=>{
        let delay = config.preDelayMs;
        if (config.mode === 'sequential') delay += 600; // petit espace
        setTimeout(playTriadNow, delay);
      });
    }catch(_){}
  }

  function playTriadNow(){
    stopAllSounds(); if(!currentNotes) return;
    playArray(currentNotes);
  }

  function playSpecificVoicing(which){
    if (config.voicing !== 'both') return; // boutons visibles uniquement si both
    if (which === 'open' && currentOpen) { stopAllSounds(); playArray(currentOpen); }
    if (which === 'close' && currentClosed) { stopAllSounds(); playArray(currentClosed); }
  }

  function playArray(arr){
    if(config.mode==='sequential' && config.noteGapMs>0){
      arr.forEach((n,i)=>{
        setTimeout(()=>{
          const au=preloadedSounds[n]; if(!au) return;
          try{ au.currentTime=0; au.play(); }catch(_){}
          setTimeout(()=>{ try{au.pause(); au.currentTime=0;}catch(_){}; }, 800);
        }, i*config.noteGapMs);
      });
    }else{
      arr.forEach(n=>{
        const au=preloadedSounds[n]; if(!au) return;
        try{ au.currentTime=0; au.play(); }catch(_){}
      });
      setTimeout(()=>{ arr.forEach(n=>{ const a=preloadedSounds[n]; if(a){ try{a.pause(); a.currentTime=0;}catch(_){} } }); }, config.playbackMs);
    }
  }

  // =======================================================
  // 13) HUD (progress / score / timer)
  // =======================================================
  function updateHud(){
    const qShown = Math.max(0, Math.min(questionIndex+1, config.totalQuestions));
    progressDiv && (progressDiv.textContent=`Question ${qShown}/${config.totalQuestions}`);
    scoreDiv && (scoreDiv.textContent   =`Score : ${scoreTotal}`);
    timingDiv && (timingDiv.textContent =`Temps: ${ startTime ? ((Date.now()-startTime)/1000).toFixed(1) : '0.0'}s`);
  }
  function tickHudTimer(){ updateHud(); if(hudTimerActive) setTimeout(tickHudTimer,500); }

  // =======================================================
  // 14) Validation des réponses
  // =======================================================
  function getInvLabel(ui){
    switch(ui){
      case 'Root Position': return 'PF';
      case 'First Inversion': return 'R1';
      case 'Second Inversion': return 'R2';
      default: return '';
    }
  }

  function validateAnswer(){
    if (answeredThisQuestion) return;
    if (!triadSelect || !inversionSelect || !fundamentalSelect) return;

    const triad = triadSelect.value;
    const fund  = fundamentalSelect.value;
    const invUi = (inversionSelect.style.display==='none') ? 'Root Position' : inversionSelect.value;
    const inv   = getInvLabel(invUi);

    // si voicing = both → on doit répondre Close/Open ; sinon on considère correct implicitement
    const answeredVoicing = (config.voicing === 'both')
      ? (voicingAnswerSelect?.value || '')
      : playedVoicing;

    const t = (Date.now()-questionStartTime)/1000;
    const within = t <= EXAM_TIME_LIMIT_S;

    const exp = parseAnswer(correctAnswer);
    const isTypeMatch    = (triad === exp.triad) && (inv === exp.inv);
    const isFundMatch    = (fund === exp.fund);
    const isVoicingMatch = (config.voicing === 'both') ? (answeredVoicing === playedVoicing) : true;

    let gained = 0;
    let examPoints = 0;
    let feedbackHTML = '';

    answeredThisQuestion = true;
    submitBtn && (submitBtn.disabled = true);

    if (!isVoicingMatch) {
      feedbackHTML = `
        <span style="color:#c62828;">Voicing incorrect ❌ — attendu : <strong>${playedVoicing}</strong></span>
        <div class="hint-relisten">Réécoute si tu veux, puis clique “Question suivante”.</div>`;
      examPoints = 0;

    } else if (within && isTypeMatch && isFundMatch) {
      gained = computeQuestionPoints(true, t, config);
      scoreTotal += gained;
      examPoints = 2;

      feedbackHTML = `
        <span style="color:#1f8b24; font-weight:700;">Correct ! ✅</span>
        <div style="margin-top:6px; font-size:14px;">
          Base 100 + Bonus temps ${getTimeBonus(t)} (${t.toFixed(1)}s)
          • Mult. ×${getDifficultyMultiplier(config).toFixed(2)}
          → <strong>${gained} pts</strong>
        </div>`;

      nextBtn && (nextBtn.disabled = true);
      setTimeout(()=>{ nextBtn && (nextBtn.disabled=false); advance(); }, 1200);

    } else if (within && isTypeMatch && !isFundMatch) {
      gained = Math.round(computeQuestionPoints(true, t, config) / 2);
      scoreTotal += gained;
      examPoints = 1;

      feedbackHTML = `
        <span style="color:#2e7dd7; font-weight:700;">Presque ! ✳️</span>
        <div style="margin-top:6px; font-size:14px;">
          Type + renversement corrects, mais tonique incorrecte<br>
          → <strong>${gained} pts (gaming)</strong> • <strong>+1 pt (examen)</strong><br>
          Bonne réponse : <strong>${correctAnswer}</strong>
        </div>
        <div class="hint-relisten">Réécoute si tu veux, puis clique “Question suivante”.</div>`;

    } else {
      const slowNote = within ? '' : `<div style="margin-top:6px; color:#c62828;">⏱️ &gt; ${EXAM_TIME_LIMIT_S}s : 0 pt</div>`;
      feedbackHTML = `
        <span style="color:#c62828;">Incorrect ❌ — bonne réponse : <strong>${correctAnswer}</strong></span>
        ${slowNote}
        <div class="hint-relisten">Réécoute si tu veux, puis clique “Question suivante”.</div>`;
      examPoints = 0;
    }

    if (questionIndex >= 0 && questionIndex < config.totalQuestions) {
      examPointsByIndex[questionIndex] = examPoints;
      gamePointsByIndex[questionIndex] = gained;
    }

    validationDiv && (validationDiv.innerHTML = feedbackHTML);
    updateHud();
  }

  // =======================================================
  // 15) Fin de test + Scoreboard
  // =======================================================
  function endGame(){
    hudTimerActive=false;
    const timeTaken=((Date.now()-startTime)/1000).toFixed(2);

    const finalizedExam = examPointsByIndex.map(v => (v==null ? 0 : v)).slice(0, config.totalQuestions);
    const grade20 = finalizedExam.reduce((a,b)=>a+b,0); // somme de 0/1/2

    const twoPts = finalizedExam.filter(v=>v===2).length;
    const onePt  = finalizedExam.filter(v=>v===1).length;
    const zeroPt = config.totalQuestions - twoPts - onePt;

    let label, img;
    if (grade20 >= 16) { label='Très bien'; img=SCORE_IMG.success; }
    else if (grade20 >= 10) { label='Correct'; img=SCORE_IMG.ok; }
    else { label='Insuffisant'; img=SCORE_IMG.fail; }

    resultDiv && (resultDiv.innerHTML = `
      <section class="result-summary">
        <p class="result-title"><strong>Test terminé !</strong></p>
        <p class="result-grade">${label}</p>
        <div class="trophy-block">
          <img src="${img}" alt="${label}" class="score-img" onerror="this.style.display='none'"/>
        </div>
        <p class="result-line">Score : <strong>${scoreTotal}</strong></p>
        <p class="result-line">Note : <strong>${Math.round(grade20)}/20</strong>
           <span class="result-sub">(${twoPts}×2 pts, ${onePt}×1 pt, ${zeroPt}×0 pt)</span>
        </p>
        <p class="result-line">Temps total : ${timeTaken}s</p>
      </section>
      <section id="scoreboard"></section>
    `);

    nextBtn && (nextBtn.disabled=true);

    saveScore({
      grade20,
      validatedFull: twoPts,
      validatedHalf: onePt,
      score: scoreTotal,
      avgTime: finalizedExam.length
        ? Math.round((((Date.now()-startTime)/1000) / finalizedExam.length)*10)/10
        : 0
    });

    renderScoreboard();
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(_){}
  }

  // ---------- Scoreboard (localStorage Top 5) ----------
  const SCORE_KEY = 'triadScores';
  function loadScores(){ try{ return JSON.parse(localStorage.getItem(SCORE_KEY)||'[]'); }catch(_){ return []; } }
  function saveScore(entry){
    const all=loadScores();
    all.push({
      date: new Date().toISOString(),
      mode: config.mode,
      gametype: config.gametype,
      voicing: config.voicing,
      triads: (config.allowedTriads||[]).slice(),
      total: config.totalQuestions,
      validatedFull: entry.validatedFull,
      validatedHalf: entry.validatedHalf,
      grade20: Math.round(entry.grade20),
      score: entry.score,
      avgTime: entry.avgTime
    });
    localStorage.setItem(SCORE_KEY, JSON.stringify(all));
  }
  function renderScoreboard(){
    const mount = $('scoreboard');
    if (!mount) return;

    const all = loadScores();
    if (!all.length) { mount.innerHTML=''; return; }

    const top5 = all.slice().sort((a,b)=>(b.grade20-a.grade20)||(b.score-a.score)).slice(0,5);
    const rows = top5.map((s, idx)=>`
      <tr>
        <td data-label="Rang">#${idx+1}</td>
        <td data-label="Note">${s.grade20}/20</td>
        <td data-label="Score">${s.score}</td>
        <td data-label="Mode">${s.gametype}/${s.mode}/${s.voicing}</td>
        <td data-label="Triades">${(s.triads||[]).join(', ')||'—'}</td>
        <td data-label="Temps moyen">${s.avgTime ?? 0}s</td>
      </tr>`).join('');

    mount.innerHTML = `
      <h3 class="result-h3">Top 5 — Meilleurs scores</h3>
      <div class="table-wrap">
        <table class="score-table">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Note</th>
              <th>Score</th>
              <th>Mode</th>
              <th>Triades</th>
              <th>Temps moyen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // =======================================================
  // 16) HUD loop (sécurité duplication)
  // =======================================================
  function tickHudTimer(){ updateHud(); if(hudTimerActive) setTimeout(tickHudTimer,500); }
  function updateHud(){
    const qShown = Math.max(0, Math.min(questionIndex+1, config.totalQuestions));
    progressDiv && (progressDiv.textContent=`Question ${qShown}/${config.totalQuestions}`);
    scoreDiv && (scoreDiv.textContent=`Score : ${scoreTotal}`);
    timingDiv && (timingDiv.textContent=`Temps: ${ startTime ? ((Date.now()-startTime)/1000).toFixed(1) : '0.0'}s`);
  }

});