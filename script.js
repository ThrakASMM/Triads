/* =====================================================================
   Ear Training — Triades (ASMM)
   Script complet, robuste et commenté
   ---------------------------------------------------------------------
   - Entraînement & Test (10 questions)
   - Mode séparé (notes séquentielles) ou simultané
   - Voicings: close / open / both
     · “both” => 4e select “Close/Open” + 2 boutons d’écoute (comparer)
   - Triades sélectionnables (Maj, Min, Aug, Sus4, Dim, Sus#4, Susb2)
   - Open triads = note du milieu +1 octave (clamp pour éviter les aigus)
   - Registre maîtrisé (C2…B4, clamp final ≤ top C5)
   - Scoring examen 2/1/0 (≤ 60s) + “gaming score” à base de bonus temps
   - “Passer” = cliquer “Question suivante” sans valider → 0 pt
   - Top 5 en localStorage (tri par note /20 puis score)
   - Aucune fuite de réponse dans l’énoncé (on affiche le *mode* joué)
   ===================================================================== */

   document.addEventListener('DOMContentLoaded', () => {
    /* ------------------------- 1) CONSTANTES -------------------------- */
  
    // Timings: adapte les délais selon le mode
    const TIMINGS = {
      test:       { preDelayMs: 1500, playbackMs: 4000, noteGapMs: 0 },
      sequential: { preDelayMs:  800, playbackMs: 2200, noteGapMs: 600 },
      training:   { preDelayMs:  400, playbackMs: 5000, noteGapMs: 0   }
    };
  
    const EXAM_TIME_LIMIT_S = 60;           // au-delà -> 0 pt examen
    const TOTAL_QUESTIONS_DEFAULT = 10;
  
    // Images pour l’écran de fin (place-les dans /img)
    const SCORE_IMG = {
      success: 'img/success.png',
      ok:      'img/ok.png',
      fail:    'img/fail.png',
    };
  
    // Registre audio (fichiers dans /audio/C2.mp3, …, B4.mp3)
    const AUDIO_MIN_OCT = 2; // C2
    const AUDIO_MAX_OCT = 4; // B4
    const MAX_TOP_OCT   = 5; // clamp final de sécurité
  
    // Cartographie des notes
    const noteMap = { 'C':0,'Db':1,'D':2,'Eb':3,'E':4,'F':5,'Gb':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11 };
    const reverseNoteMap = Object.keys(noteMap).reduce((acc, k) => (acc[noteMap[k]] = k, acc), {});
    // Equivalences enharmoniques pour l’affichage dans la liste des fondamentales
    const enharm = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#' };
  
    // Liste type/inversions
    const ALL_TRIADS = ['Maj','Min','Aug','Sus4','Dim','Sus#4','Susb2'];
    const INVERSIONS_UI = ['Root Position','First Inversion','Second Inversion']; // UI
    // Codes internes d’inversion : PF (position fondamentale), R1, R2
  
    // Structures d’intervalles (triades fermées, du grave vers l’aigu)
    // Chaque item: intervals = [n1->n2, n2->n3] en demi-tons.
    const TRIAD_STRUCTURES = [
      // --- Position fondamentale (PF)
      { type:'Maj',   inv:'PF', intervals:[4,3] },
      { type:'Min',   inv:'PF', intervals:[3,4] },
      { type:'Aug',   inv:'PF', intervals:[4,4] },       // pas de renversement pour Aug
      { type:'Sus4',  inv:'PF', intervals:[5,2] },
      { type:'Dim',   inv:'PF', intervals:[3,3] },
  
      // --- R1 (1er renversement)
      { type:'Maj',   inv:'R1', intervals:[3,5] },
      { type:'Min',   inv:'R1', intervals:[4,5] },
      { type:'Sus4',  inv:'R1', intervals:[2,5] },
      { type:'Dim',   inv:'R1', intervals:[3,6] },
  
      // --- R2 (2e renversement)
      { type:'Maj',   inv:'R2', intervals:[5,4] },
      { type:'Min',   inv:'R2', intervals:[5,3] },
      { type:'Sus4',  inv:'R2', intervals:[5,5] },
      { type:'Dim',   inv:'R2', intervals:[6,3] },
  
      // --- Nouvelles triades (vérifiées)
      // Sus#4 : 1 #4 5  ->  PF=[6,1], R1=[1,7], R2=[7,6]
      { type:'Sus#4', inv:'PF', intervals:[6,1] },
      { type:'Sus#4', inv:'R1', intervals:[1,7] },
      { type:'Sus#4', inv:'R2', intervals:[7,6] },
      // Susb2 : 1 b2 5 ->  PF=[1,6], R1=[6,7], R2=[7,1]
      { type:'Susb2', inv:'PF', intervals:[1,6] },
      { type:'Susb2', inv:'R1', intervals:[6,7] },
      { type:'Susb2', inv:'R2', intervals:[7,1] },
    ];
  
    // Audio map (charge C2..B4)
    const audioMap = {};
    for (let o = AUDIO_MIN_OCT; o <= AUDIO_MAX_OCT; o++) {
      for (const n of Object.keys(noteMap)) {
        audioMap[`${n}${o}`] = `audio/${n}${o}.mp3`;
      }
    }
    const preloaded = {}; // { "C3": Audio, ... }
  
    /* --------------------------- 2) DOM REFS -------------------------- */
  
    const $ = id => document.getElementById(id);
  
    // HUD
    const progressDiv = $('progress');
    const scoreDiv    = $('score');
    const timingDiv   = $('timing');
  
    // Containers
    const menu        = $('menu');
    const game        = $('game');
  
    // Question + feedback + résultats
    const questionDiv = $('question');
    const feedbackDiv = $('validation-message');
    const resultDiv   = $('result');
  
    // Contrôles “menu”
    const startBtn   = $('start-game');
  
    // Contrôles “jeu”
    const submitBtn  = $('submit-answer');
    const nextBtn    = $('next-question');
    const replayAll  = $('replay-single-and-triad');
    const replayTri  = $('replay-triad-only');
    const forceClose = $('force-close');
    const forceOpen  = $('force-open');
    const restartBtn = $('restart-test');
    const backBtn    = $('back-to-menu');
  
    // Sélecteurs de réponse
    const triadSelect       = $('triad-select');
    const inversionSelect   = $('inversion-select');
    const fundamentalSelect = $('fundamental-select');
    const voicingAnswerSel  = $('voicing-select'); // visible uniquement si voicing=both
  
    // Options du menu
    const getGametype     = () => document.querySelector('[name="gametype"]:checked')?.value || 'training';
    const getMode         = () => document.querySelector('[name="mode"]:checked')?.value || 'sequential';
    const getVoicing      = () => document.querySelector('[name="voicing"]:checked')?.value || 'close';
  
    // Sélecteur des triades à inclure (training ET test)
    const triadPicker     = $('triad-picker');
    const triadChecksWrap = $('triad-checks');
    const triadWarning    = $('triad-warning');
    const btnAllTriads    = $('select-all-triads');
    const btnNoneTriads   = $('deselect-all-triads');
    const selectedCountEl = $('selected-count');
  
    /* --------------------------- 3) ÉTAT JEU -------------------------- */
  
    const Config = {
      gametype: 'training',            // training | test
      mode:     'sequential',          // sequential | simultaneous
      voicing:  'close',               // close | open | both
      allowedTriads: ALL_TRIADS.slice(),
      preDelayMs: TIMINGS.training.preDelayMs,
      playbackMs: TIMINGS.training.playbackMs,
      noteGapMs:  TIMINGS.training.noteGapMs,
      totalQuestions: TOTAL_QUESTIONS_DEFAULT,
    };
  
    // Pool de structures possible selon triades incluses
    let triadPool = TRIAD_STRUCTURES.slice();
  
    // État question courante
    let currentClosed = null;   // triade fermée générée
    let currentOpen   = null;   // triade ouverte (note milieu +1 octave)
    let currentNotes  = null;   // triade réellement “posée”
    let playedModeStr = '';     // "close" / "open" — uniquement pour écoute (pas montré comme réponse à deviner)
  
    let firstNotePlayed = null; // pour l’annonce de la note de départ
    let correctAnswerKey = '';  // “CFaMajPF” (ex: “CMajPF”) ou “DbMinR2”… (on stocke un motif simple)
  
    let questionIndex = -1;
    let scoreTotal    = 0;                   // gaming score (points bonus)
    let startTime     = null;                // départ global
    let questionStart = null;                // départ question courante
    let hudTimerOn    = false;
    let answeredThis  = false;
  
    // Scores examen / question
    let examPtsByQ = [];  // 0 / 1 / 2 (ou null si non répondu)
    let gamePtsByQ = [];  // bonus “gaming” par question
  
    /* ----------------------- 4) OUTILS MUSICAUX ----------------------- */
  
    const rndOf = arr => arr[Math.floor(Math.random() * arr.length)];
  
    const splitNote = n => ({ idx: noteMap[n.slice(0,-1)], oct: parseInt(n.slice(-1),10) });
    const mkNote    = (idx, oct) => `${reverseNoteMap[(idx+12)%12]}${oct}`;
    const midi      = n => { const s=splitNote(n); return s.idx + 12*s.oct; };
  
    const enhName = n => {                       // C -> C/C# ? Non, juste pour les menus
      const nm = n.slice(0,-1), oc = n.slice(-1);
      return enharm[nm] ? `${nm}/${enharm[nm]}${oc}` : n;
    };
  
    function randomBaseNote() {
      // on préfère éviter de partir tout en haut pour garder l’open triad audible
      const startOct = AUDIO_MIN_OCT;
      const endOct   = Math.max(AUDIO_MIN_OCT, AUDIO_MAX_OCT - 1);
      const oct = Math.floor(Math.random() * (endOct - startOct + 1)) + startOct;
      const name = rndOf(Object.keys(noteMap));
      return `${name}${oct}`;
    }
  
    // Génère triade (fermée OU ouverte) à partir d’une structure
    function buildTriad(baseNote, structure, openVoicing=false) {
      const base = splitNote(baseNote);
      const notes = [ baseNote ];
      let curIdx = base.idx;
      let curOct = base.oct;
  
      // Monte successivement selon intervals [a,b]
      for (const semi of structure.intervals) {
        const next = (curIdx + semi) % 12;
        if (next < curIdx) curOct = Math.min(AUDIO_MAX_OCT, curOct + 1); // saut d’octave
        notes.push(mkNote(next, curOct));
        curIdx = next;
      }
  
      // Trie grave→aigu
      notes.sort((a,b)=>midi(a)-midi(b));
  
      // Contraint à ~1 octave pour que ce soit confortable
      const minOct = splitNote(notes[0]).oct;
      const maxAllowed = minOct + 1;
      const compact = notes.map(n => {
        const s=splitNote(n);
        if (s.oct > maxAllowed) s.oct = maxAllowed;
        return mkNote(s.idx, s.oct);
      });
  
      // OPEN : monter la note du milieu d’une octave (si possible)
      if (openVoicing) {
        let mid = splitNote(compact[1]);
        mid.oct = Math.min(MAX_TOP_OCT, mid.oct + 1);
        compact[1] = mkNote(mid.idx, mid.oct);
        compact.sort((a,b)=>midi(a)-midi(b));
      }
  
      // clamp ultime (sécurité) sur la plus aiguë
      let top = splitNote(compact[2]);
      if (top.oct > MAX_TOP_OCT) compact[2] = mkNote(top.idx, MAX_TOP_OCT);
  
      return compact;
    }
  
    // Analyse une triade triée grave→aigu pour en déduire type / inversion / fondamentale
    function analyzeTriad(arr) {
      const [n1,n2,n3] = arr;
      const i1 = (noteMap[n2.slice(0,-1)] - noteMap[n1.slice(0,-1)] + 12) % 12;
      const i2 = (noteMap[n3.slice(0,-1)] - noteMap[n2.slice(0,-1)] + 12) % 12;
  
      let triadType='', inversion='PF', fundamental = n1.slice(0,-1);
  
      // PF
      if (i1===4 && i2===3) { triadType='Maj'; inversion='PF'; }
      else if (i1===3 && i2===4) { triadType='Min'; inversion='PF'; }
      else if (i1===4 && i2===4) { triadType='Aug'; inversion='PF'; }
      else if (i1===5 && i2===2) { triadType='Sus4'; inversion='PF'; }
      else if (i1===3 && i2===3) { triadType='Dim'; inversion='PF'; }
  
      // R1
      else if (i1===3 && i2===5) { triadType='Maj'; inversion='R1'; fundamental = n3.slice(0,-1); }
      else if (i1===4 && i2===5) { triadType='Min'; inversion='R1'; fundamental = n3.slice(0,-1); }
      else if (i1===2 && i2===5) { triadType='Sus4'; inversion='R1'; fundamental = n3.slice(0,-1); }
      else if (i1===3 && i2===6) { triadType='Dim'; inversion='R1'; fundamental = n3.slice(0,-1); }
  
      // R2
      else if (i1===5 && i2===4) { triadType='Maj'; inversion='R2'; fundamental = n2.slice(0,-1); }
      else if (i1===5 && i2===3) { triadType='Min'; inversion='R2'; fundamental = n2.slice(0,-1); }
      else if (i1===5 && i2===5) { triadType='Sus4'; inversion='R2'; fundamental = n2.slice(0,-1); }
      else if (i1===6 && i2===3) { triadType='Dim'; inversion='R2'; fundamental = n2.slice(0,-1); }
  
      // Sus#4
      else if (i1===6 && i2===1) { triadType='Sus#4'; inversion='PF'; }
      else if (i1===1 && i2===7) { triadType='Sus#4'; inversion='R1'; fundamental=n3.slice(0,-1); }
      else if (i1===7 && i2===6) { triadType='Sus#4'; inversion='R2'; fundamental=n2.slice(0,-1); }
  
      // Susb2
      else if (i1===1 && i2===6) { triadType='Susb2'; inversion='PF'; }
      else if (i1===6 && i2===7) { triadType='Susb2'; inversion='R1'; fundamental=n3.slice(0,-1); }
      else if (i1===7 && i2===1) { triadType='Susb2'; inversion='R2'; fundamental=n2.slice(0,-1); }
  
      return { triadType, inversion, fundamental };
    }
  
    // Convertit “Root Position” -> “PF”, etc.
    const invUI2Code = ui =>
      ui==='Root Position' ? 'PF' : (ui==='First Inversion' ? 'R1' : 'R2');
  
    // Parse la chaîne clé “CMajPF” -> {fund:'C', triad:'Maj', inv:'PF'}
    function parseAnswerKey(key) {
      const inv = key.endsWith('PF') ? 'PF' : (key.endsWith('R1') ? 'R1' : 'R2');
      const body = key.slice(0, -inv.length);
      const types = ['Maj','Min','Aug','Sus4','Dim','Sus#4','Susb2'];
      let triad='', fund='';
      for (const t of types) {
        if (body.endsWith(t)) { triad = t; fund = body.slice(0, body.length - t.length); break; }
      }
      return { fund, triad, inv };
    }
  
    /* ------------------------- 5) SCORING LOGIQUE --------------------- */
  
    function difficultyMultiplier(cfg) {
      const triadBoost = 1 + 0.10 * Math.max(0, (cfg.allowedTriads?.length || 1) - 1);
      const modeBoost  = (cfg.mode==='sequential') ? 1.00 : 1.20; // simultané plus dur
      const voiceBoost =
        cfg.voicing==='open' ? 1.15 :
        cfg.voicing==='both' ? 1.10 : 1.00;
      return Math.min(2.20, Number((triadBoost * modeBoost * voiceBoost).toFixed(2)));
    }
  
    function timeBonus(sec) {
      const t = Math.max(0, sec);
      if (t<=1.5) return 150;
      if (t<=3)   return 120;
      if (t<=5)   return 100;
      if (t<=8)   return 80;
      if (t<=12)  return 60;
      if (t<=18)  return 45;
      if (t<=25)  return 35;
      if (t<=35)  return 25;
      if (t<=45)  return 15;
      return 5;
    }
  
    function questionPoints(isCorrect, elapsedS, cfg) {
      if (!isCorrect) return 0;
      return Math.round((100 + timeBonus(elapsedS)) * difficultyMultiplier(cfg));
    }
  
    /* ---------------------- 6) MENU — TRIAD PICKER -------------------- */
  
    function buildTriadChecks() {
      triadChecksWrap.innerHTML = '';
      ALL_TRIADS.forEach(label => {
        const l = document.createElement('label');
        l.style.display='inline-flex';
        l.style.alignItems='center';
        l.style.gap='8px';
        l.style.marginRight='12px';
  
        const c = document.createElement('input');
        c.type='checkbox'; c.value=label; c.checked=true;
        c.addEventListener('change', () => { updatePickCount(); applySettings(); });
  
        l.appendChild(c); l.append(label);
        triadChecksWrap.appendChild(l);
      });
      updatePickCount();
    }
  
    function updatePickCount() {
      const n = triadChecksWrap.querySelectorAll('input[type="checkbox"]:checked').length;
      selectedCountEl.textContent = `${n} sélectionnée${n>1?'s':''}`;
    }
  
    btnAllTriads.onclick  = () => { triadChecksWrap.querySelectorAll('input').forEach(c=>c.checked=true);  updatePickCount(); applySettings(); };
    btnNoneTriads.onclick = () => { triadChecksWrap.querySelectorAll('input').forEach(c=>c.checked=false); updatePickCount(); applySettings(); };
  
    /* --------------------------- 7) SETTINGS --------------------------- */
  
    function applySettings() {
      Config.gametype = getGametype();
      Config.mode     = getMode();
      Config.voicing  = getVoicing();
  
      const sel = Array.from(triadChecksWrap.querySelectorAll('input:checked')).map(c=>c.value);
      Config.allowedTriads = sel;
      triadWarning.style.display = sel.length ? 'none' : 'block';
  
      const T = (Config.gametype==='training') ? TIMINGS.training :
                (Config.mode==='sequential' ? TIMINGS.sequential : TIMINGS.test);
      Config.preDelayMs = T.preDelayMs;
      Config.playbackMs = T.playbackMs;
      Config.noteGapMs  = T.noteGapMs || 0;
      Config.totalQuestions = TOTAL_QUESTIONS_DEFAULT;
  
      // Pool de structures filtré
      triadPool = TRIAD_STRUCTURES.filter(s => Config.allowedTriads.includes(s.type));
  
      // Visibilité des contrôles liés au voicing “both”
      const showBoth = (Config.voicing === 'both');
      forceClose.style.display = showBoth ? 'inline-block' : 'none';
      forceOpen.style.display  = showBoth ? 'inline-block' : 'none';
      voicingAnswerSel.style.display = showBoth ? 'block' : 'none';
    }
  
    document.querySelectorAll('[name="gametype"]').forEach(r=>r.addEventListener('change', applySettings));
    document.querySelectorAll('[name="mode"]').forEach(r=>r.addEventListener('change', applySettings));
    document.querySelectorAll('[name="voicing"]').forEach(r=>r.addEventListener('change', applySettings));
  
    buildTriadChecks();
    applySettings();
  
    /* ----------------------- 8) AUDIO: CHARGEMENT --------------------- */
  
    function preloadAudio() {
      const tasks = [];
      for (let o = AUDIO_MIN_OCT; o <= AUDIO_MAX_OCT; o++) {
        for (const n of Object.keys(noteMap)) {
          const key = `${n}${o}`, a = new Audio(audioMap[key]);
          preloaded[key] = a;
          tasks.push(new Promise(res=>{
            a.addEventListener('canplaythrough',()=>res(),{once:true});
            a.addEventListener('error',()=>res(),{once:true}); // on résout quand même
          }));
        }
      }
      return Promise.all(tasks);
    }
  
    function stopAll() {
      Object.values(preloaded).forEach(a=>{
        try{ a.pause(); a.currentTime=0; a.volume=1; }catch(_){}
      });
    }
  
    function playArray(arr) {
      if (Config.mode==='sequential' && Config.noteGapMs>0) {
        arr.forEach((n,i)=>{
          setTimeout(()=>{
            const a = preloaded[n]; if (!a) return;
            try{ a.currentTime=0; a.play(); }catch(_){}
            setTimeout(()=>{ try{a.pause(); a.currentTime=0;}catch(_){}; }, 800);
          }, i*Config.noteGapMs);
        });
      } else {
        arr.forEach(n=>{
          const a = preloaded[n]; if (!a) return;
          try{ a.currentTime=0; a.play(); }catch(_){}
        });
        // coupe au bout de playbackMs
        setTimeout(()=>{ arr.forEach(n=>{ const a=preloaded[n]; if(a){ try{a.pause(); a.currentTime=0;}catch(_){} } }); }, Config.playbackMs);
      }
    }
  
    function replaySingleThenTriad() {
      stopAll();
      if (!currentNotes || !firstNotePlayed) return;
      const a = preloaded[firstNotePlayed]; if (!a) return;
  
      try{
        a.currentTime=0; a.play();
        let d = Config.preDelayMs;
        if (Config.mode==='sequential') d += 600; // petit espace
        setTimeout(() => playArray(currentNotes), d);
      }catch(_){}
    }
  
    function playSpecificVoicing(which) {
      if (Config.voicing !== 'both') return;
      stopAll();
      if (which==='close' && currentClosed) playArray(currentClosed);
      if (which==='open'  && currentOpen)  playArray(currentOpen);
    }
  
    /* -------------------------- 9) CYCLE JEU -------------------------- */
  
    startBtn.onclick  = startGame;
    restartBtn.onclick= startGame;
    backBtn.onclick   = backToMenu;
  
    replayAll.onclick = replaySingleThenTriad;
    replayTri.onclick = () => { stopAll(); if(currentNotes) playArray(currentNotes); };
    forceClose.onclick= () => playSpecificVoicing('close');
    forceOpen.onclick = () => playSpecificVoicing('open');
  
    nextBtn.onclick = () => {
      // Passer = 0 pt si aucune validation
      if (!answeredThis && questionIndex >=0 && questionIndex < Config.totalQuestions) {
        examPtsByQ[questionIndex] = 0;
        gamePtsByQ[questionIndex] = 0;
        answeredThis = true;
      }
      advance();
    };
  
    submitBtn.onclick = validateAnswer;
  
    async function startGame() {
      applySettings();
      if (!Config.allowedTriads.length) {
        triadWarning.style.display='block';
        return;
      }
      // Préparer l’UI
      menu.style.display='none';
      game.style.display='block';
      resultDiv.innerHTML = '';
      feedbackDiv.textContent = '';
  
      // Reset état
      questionIndex = -1;
      scoreTotal    = 0;
      answeredThis  = false;
      examPtsByQ = new Array(Config.totalQuestions).fill(null);
      gamePtsByQ = new Array(Config.totalQuestions).fill(0);
  
      buildSelects();
      await preloadAudio().catch(()=>{});
  
      // Timer HUD
      startTime = Date.now();
      hudTimerOn = true;
      tickHUD();
  
      try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(_){}
      advance();
    }
  
    function backToMenu() {
      stopAll();
      hudTimerOn = false;
      game.style.display='none';
      menu.style.display='block';
    }
  
    function advance() {
      questionIndex += 1;
      if (questionIndex >= Config.totalQuestions) { endGame(); return; }
      nextQuestion();
    }
  
    function buildSelects() {
      // Triade
      triadSelect.innerHTML = '';
      (Config.allowedTriads.length ? Config.allowedTriads : ALL_TRIADS).forEach(t=>{
        const o=document.createElement('option'); o.value=t; o.textContent=t; triadSelect.appendChild(o);
      });
  
      // Inversion (UI)
      inversionSelect.innerHTML='';
      INVERSIONS_UI.forEach(inv=>{
        const o=document.createElement('option'); o.value=inv; o.textContent=inv; inversionSelect.appendChild(o);
      });
  
      // Fondamentale
      fundamentalSelect.innerHTML='';
      Object.keys(noteMap).forEach(n=>{
        const o=document.createElement('option');
        o.value=n; o.textContent = enharm[n] ? `${n}/${enharm[n]}` : n;
        fundamentalSelect.appendChild(o);
      });
  
      // Voicing (si both)
      voicingAnswerSel.innerHTML='';
      ['close','open'].forEach(v=>{
        const o=document.createElement('option');
        o.value=v; o.textContent = v[0].toUpperCase()+v.slice(1);
        voicingAnswerSel.appendChild(o);
      });
      voicingAnswerSel.style.display = (Config.voicing==='both') ? 'block' : 'none';
  
      triadSelect.onchange = () => {
        // Aug : pas de renversements côté UX => masque le select
        inversionSelect.style.display = (triadSelect.value==='Aug') ? 'none' : 'block';
      };
  
      triadSelect.selectedIndex = 0;
      inversionSelect.selectedIndex = 0;
      fundamentalSelect.selectedIndex = 0;
      triadSelect.dispatchEvent(new Event('change'));
    }
  
    function nextQuestion() {
      // reset UI
      feedbackDiv.textContent='';
      resultDiv.textContent='';
      nextBtn.disabled = false;
      submitBtn.disabled = false;
      answeredThis = false;
  
      triadSelect.selectedIndex = 0;
      inversionSelect.selectedIndex = 0;
      fundamentalSelect.selectedIndex = 0;
      voicingAnswerSel.selectedIndex = 0;
      inversionSelect.style.display = (triadSelect.value==='Aug') ? 'none' : 'block';
      voicingAnswerSel.style.display = (Config.voicing==='both') ? 'block' : 'none';
  
      // Génération
      const struct = rndOf(triadPool);
      const base   = randomBaseNote();
  
      currentClosed = buildTriad(base, struct, false);
      currentOpen   = buildTriad(base, struct, true);
  
      // Choix de ce qui est réellement posé
      if (Config.voicing==='open') {
        currentNotes  = currentOpen;  playedModeStr = 'open';
      } else if (Config.voicing==='close') {
        currentNotes  = currentClosed; playedModeStr = 'close';
      } else {
        const openThis = Math.random() < 0.5;
        currentNotes  = openThis ? currentOpen : currentClosed;
        playedModeStr = openThis ? 'open' : 'close';
      }
  
      // Clé de correction
      const analysis = analyzeTriad(currentNotes);
      correctAnswerKey = `${analysis.fundamental}${analysis.triadType}${analysis.inversion}`;
  
      // Annonce de la note de départ : on choisit l’une des 3
      firstNotePlayed = rndOf(currentNotes);
  
      // IMPORTANT : ne pas révéler le voicing ! On affiche “Mode: close/open”
      questionDiv.textContent = `Note jouée : ${enhName(firstNotePlayed)} — Mode: ${playedModeStr}`;
  
      // Lancement audio
      questionStart = Date.now();
      replaySingleThenTriad();
  
      // HUD
      updateHUD();
    }
  
    /* -------------------------- 10) HUD TIMER -------------------------- */
  
    function updateHUD() {
      const qShown = Math.max(0, Math.min(questionIndex+1, Config.totalQuestions));
      progressDiv.textContent = `Question ${qShown}/${Config.totalQuestions}`;
      scoreDiv.textContent    = `Score : ${scoreTotal}`;
      timingDiv.textContent   = `Temps: ${ startTime ? ((Date.now()-startTime)/1000).toFixed(1) : '0.0'}s`;
    }
    function tickHUD() { updateHUD(); if (hudTimerOn) setTimeout(tickHUD, 500); }
  
    /* ------------------------- 11) VALIDATION ------------------------- */
  
    function validateAnswer() {
      if (answeredThis) return;
  
      const triad  = triadSelect.value;
      const fund   = fundamentalSelect.value;
      const invUI  = (inversionSelect.style.display==='none') ? 'Root Position' : inversionSelect.value;
      const inv    = invUI2Code(invUI);
  
      // Si “both”, l’utilisateur doit également répondre le voicing
      const answeredVoicing = (Config.voicing==='both') ? voicingAnswerSel.value : playedModeStr;
  
      const tSec = (Date.now() - questionStart) / 1000;
      const inTime = tSec <= EXAM_TIME_LIMIT_S;
  
      const expected = parseAnswerKey(correctAnswerKey);
      const typeOK   = (triad === expected.triad) && (inv === expected.inv);
      const fundOK   = (fund  === expected.fund);
      const voiceOK  = (answeredVoicing === playedModeStr);
  
      let gained = 0, examPts = 0, html = '';
  
      answeredThis = true;
      submitBtn.disabled = true;
  
      if (!voiceOK) {
        html = `
          <span class="feedback err">Voicing incorrect ❌ — attendu : <strong>${playedModeStr}</strong></span>
          <div class="hint-relisten">Réécoute si tu veux, puis clique “Question suivante”.</div>`;
        examPts = 0;
  
      } else if (inTime && typeOK && fundOK) {
        gained = questionPoints(true, tSec, Config);
        scoreTotal += gained;
        examPts = 2;
        html = `
          <span class="feedback ok">Correct ! ✅</span>
          <div style="margin-top:6px;font-size:14px;">
            Base 100 + Bonus temps ${timeBonus(tSec)} (${tSec.toFixed(1)}s)
            • Mult. ×${difficultyMultiplier(Config).toFixed(2)}
            → <strong>${gained} pts</strong>
          </div>`;
        nextBtn.disabled = true;
        setTimeout(()=>{ nextBtn.disabled=false; advance(); }, 1100);
  
      } else if (inTime && typeOK && !fundOK) {
        gained = Math.round(questionPoints(true, tSec, Config)/2);
        scoreTotal += gained;
        examPts = 1;
        html = `
          <span style="color:#2e7dd7;font-weight:700;">Presque ! ✳️</span>
          <div style="margin-top:6px;font-size:14px;">
            Type + renversement corrects, mais tonique incorrecte<br>
            → <strong>${gained} pts (gaming)</strong> • <strong>+1 pt (examen)</strong><br>
            Bonne réponse : <strong>${correctAnswerKey}</strong>
          </div>
          <div class="hint-relisten">Réécoute si tu veux, puis clique “Question suivante”.</div>`;
  
      } else {
        const slow = inTime ? '' : `<div style="margin-top:6px;color:#c62828;">⏱️ &gt; ${EXAM_TIME_LIMIT_S}s : 0 pt</div>`;
        html = `
          <span class="feedback err">Incorrect ❌ — bonne réponse : <strong>${correctAnswerKey}</strong></span>
          ${slow}
          <div class="hint-relisten">Réécoute si tu veux, puis clique “Question suivante”.</div>`;
        examPts = 0;
      }
  
      if (questionIndex >= 0 && questionIndex < Config.totalQuestions) {
        examPtsByQ[questionIndex] = examPts;
        gamePtsByQ[questionIndex] = gained;
      }
  
      feedbackDiv.innerHTML = html;
      updateHUD();
    }
  
    /* -------------------------- 12) FIN DE TEST ----------------------- */
  
    const SCORE_KEY = 'triadScores';
  
    function loadScores() {
      try { return JSON.parse(localStorage.getItem(SCORE_KEY)||'[]'); }
      catch { return []; }
    }
    function saveScore(entry) {
      const all = loadScores();
      all.push({
        date: new Date().toISOString(),
        mode: Config.mode,
        gametype: Config.gametype,
        voicing: Config.voicing,
        triads: (Config.allowedTriads||[]).slice(),
        total: Config.totalQuestions,
        validatedFull: entry.validatedFull,
        validatedHalf: entry.validatedHalf,
        grade20: Math.round(entry.grade20),       // entier (pas de .0)
        score: entry.score,
        avgTime: entry.avgTime
      });
      localStorage.setItem(SCORE_KEY, JSON.stringify(all));
    }
  
    function renderScoreboard() {
      const mount = $('scoreboard');
      if (!mount) return;
  
      const all = loadScores();
      if (!all.length) { mount.innerHTML=''; return; }
  
      const top5 = all
        .slice()
        .sort((a,b)=> (b.grade20-a.grade20) || (b.score-a.score))
        .slice(0,5);
  
      const rows = top5.map((s,i)=>`
        <tr>
          <td data-label="Rang">#${i+1}</td>
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
                <th>Rang</th><th>Note</th><th>Score</th>
                <th>Mode</th><th>Triades</th><th>Temps moyen</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
  
    function endGame() {
      hudTimerOn = false;
      const elapsed = ((Date.now()-startTime)/1000);
  
      const finalized = examPtsByQ.map(v => (v==null?0:v)).slice(0, Config.totalQuestions);
      const grade20   = finalized.reduce((a,b)=>a+b,0);        // 0..20
      const twoPts = finalized.filter(v=>v===2).length;
      const onePt  = finalized.filter(v=>v===1).length;
      const zeroPt = Config.totalQuestions - twoPts - onePt;
  
      let label, img;
      if (grade20 >= 16) { label='Très bien'; img=SCORE_IMG.success; }
      else if (grade20 >= 10) { label='Correct'; img=SCORE_IMG.ok; }
      else { label='Insuffisant'; img=SCORE_IMG.fail; }
  
      resultDiv.innerHTML = `
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
          <p class="result-line">Temps total : ${elapsed.toFixed(1)}s</p>
        </section>
        <section id="scoreboard"></section>
      `;
  
      nextBtn.disabled = true;
  
      saveScore({
        grade20,
        validatedFull: twoPts,
        validatedHalf: onePt,
        score: scoreTotal,
        avgTime: finalized.length ? Math.round((elapsed/finalized.length)*10)/10 : 0
      });
  
      renderScoreboard();
      try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(_){}
    }
  
  });