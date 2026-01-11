/* ==================================================================
   COCKUMBER RUBBER - CORE v14.1 (Polished Animations)
   (Targeted Tap System, Multi-touch, Audio Fixes, Smooth Lerp)
   ================================================================== */

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : {
    ready: () => {}, expand: () => {},
    HapticFeedback: { notificationOccurred: () => {}, impactOccurred: () => {} }
};
tg.ready();
tg.expand();

// === 1. CONFIG ===
const CONFIG = {
    REF_WIDTH: 360,
    REF_HEIGHT: 640,
    LEVEL_TIME: 60,
    WIN_SCORE: 1500,
    
    SCORE: {
        HEAD_SPIN: 2,
        BODY_RUB: 1,
        BODY_BONUS: 69, 
        TAP: 13,            
        TAP_DOUBLE: 28,    
        PENALTY_BASE: 15,
        MAX_COMBO: 3.0,    
        BONUS_GENTLE: 20,
        BONUS_BURST_MULT: 2
    },

    TAP_MECHANIC: {
        SPAWN_INTERVAL: 250, 
        DOUBLE_WINDOW: 200,  
    },

    FRAMES: {
        head: 9, 
        body: 9, 
        bottom: 4, 
        win: 10, 
        lose: 10
    },

    SCRUB: { HEAD_STEP: 0.4 },
    
    THRESHOLDS: {
        HEAD: 0.6, 
        BODY: 20,
        BODY_TOP_LIMIT: 0.2,   
        BODY_BOTTOM_LIMIT: 0.8 
    },
    
    GOALS: {
        BODY_STROKES: 8,
        HEAD_TICKS: 26 
    },

    PHASE_MIN_TIME: 4000,
    PHASE_MAX_TIME: 7000,
    PAUSE_TIME: 1000
};

const PHASES = { HEAD: 'head', BODY: 'body', TAP: 'tap', WAIT: 'wait' };

const PHASE_TEXTS = {
    [PHASES.HEAD]: "КРУТИ ГОЛОВКУ!",
    [PHASES.BODY]: "ТРИ СТВОЛ!",
    [PHASES.TAP]: "ЦЕЛЬСЯ В ЯЙЦА!",
    [PHASES.WAIT]: "ГОТОВЬСЯ..."
};

// === 2. STATE ===
let state = {
    isPlaying: false,
    score: 0,
    bestScore: 0,
    timeRemaining: CONFIG.LEVEL_TIME,
    currentPhase: PHASES.WAIT,
    phaseEndTime: 0,
    phaseTotalTime: 1,
    penaltyMultiplier: 1,
    combo: 1.0,
    lastActionTime: 0,
    
    phaseCounters: { headTicks: 0, bodyStrokes: 0 },
    strokeState: 0,

    tapTarget: null,         
    tapNextSpawnTime: 0,
    doubleTapLatch: 0        
};

let gameLoopId = null;
let timerIntervalId = null;
let resultAnimId = null;

const getEl = (id) => document.getElementById(id);
const els = {
    container: getEl('game-container'),
    world: getEl('world-layer'),
    baseCucumber: getEl('cucumber-base'),
    screens: {
        menu: getEl('screen-menu'),
        game: getEl('screen-game'),
        result: getEl('screen-result')
    },
    ui: {
        timerDigits: getEl('timer-digits'),
        progressFill: getEl('progress-fill'),
        scoreText: getEl('score-text'),
        phaseBarFill: getEl('phase-timer-fill'),
        phaseText: getEl('phase-text'),
        
        menuBestScore: getEl('menu-best-score'),
        resultScore: getEl('result-score-val'),
        resultTitle: getEl('result-title'),
        resultMsg: getEl('result-message'),
        btnStart: getEl('btn-start'),
        btnRetry: getEl('btn-retry'),
        btnNext: getEl('btn-next'),
        combo: getEl('combo-display')
    },
    zones: {
        head: getEl('zone-head'),
        body: getEl('zone-body'),
        tapLeft: getEl('zone-tap-left'),
        tapRight: getEl('zone-tap-right')
    },
    icons: {
        head: getEl('icon-head'),
        body: getEl('icon-body'),
        tap1: getEl('icon-tap-1'), 
        tap2: getEl('icon-tap-2')  
    },
    particles: getEl('particles-container')
};

// === ИЗМЕНЕНИЕ 1: Добавили targetFrame для плавности ===
let sprites = {
    head:   { frame: 0, targetFrame: 0, el: null, frames: CONFIG.FRAMES.head, visible: false },
    body:   { frame: 0, targetFrame: 0, el: null, frames: CONFIG.FRAMES.body, visible: false },
    bottom: { frame: 0, targetFrame: 0, el: null, frames: CONFIG.FRAMES.bottom, visible: false },
    win:    { frame: 0, targetFrame: 0, el: null, frames: CONFIG.FRAMES.win, visible: false },
    lose:   { frame: 0, targetFrame: 0, el: null, frames: CONFIG.FRAMES.lose, visible: false }
};

// === 3. AUDIO SYSTEM ===
const audioSystem = {
    pool: { head: [], body: [], tap: [], win: [], lose: [] },
    initialized: false,

    init: function() {
        if (this.initialized) return;
        this.createPool('tap', 10, ['assets/sfx_tap_1.mp3', 'assets/sfx_tap_2.mp3', 'assets/sfx_tap_3.mp3']); 
        this.createPool('head', 3, ['assets/sfx_head_1.mp3', 'assets/sfx_head_2.mp3', 'assets/sfx_head_3.mp3']);
        this.createPool('body', 3, ['assets/sfx_body_1.mp3', 'assets/sfx_body_2.mp3', 'assets/sfx_body_3.mp3']);
        this.createPool('win', 1, ['assets/sfx_win.mp3']);
        this.createPool('lose', 1, ['assets/sfx_lose.mp3']);
        this.initialized = true;
    },

    createPool: function(key, count, sources) {
        for (let i = 0; i < count; i++) {
            const src = sources[i % sources.length];
            const audio = new Audio(src);
            audio.volume = 0.9;
            audio.preload = 'auto';
            this.pool[key].push(audio);
        }
    },

    play: function(key) {
        if (!this.initialized) return;
        const tracks = this.pool[key];
        if (!tracks || tracks.length === 0) return;
        let sound = tracks.find(t => t.paused);
        if (!sound) { sound = tracks[0]; sound.currentTime = 0; }
        sound.play().catch(()=>{});
    }
};

// === 4. SAVE SYSTEM ===
function loadBestScore() {
    try {
        const saved = localStorage.getItem('cockumber_best');
        if (saved) {
            state.bestScore = parseInt(saved, 10);
            if (els.ui.menuBestScore) els.ui.menuBestScore.textContent = state.bestScore;
        }
    } catch (e) {}
}

function saveBestScore() {
    if (state.score > state.bestScore) {
        state.bestScore = state.score;
        try { localStorage.setItem('cockumber_best', state.bestScore); } catch (e) {}
    }
}

// === 5. INITIALIZATION ===
function initSprites() {
    const createAnimEl = (id, imgName, frameCount) => {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'anim-sprite';
            els.world.appendChild(el);
        }
        el.style.backgroundImage = `url('assets/${imgName}')`;
        el.style.backgroundSize = `${frameCount * CONFIG.REF_WIDTH}px ${CONFIG.REF_HEIGHT}px`;
        return el;
    };

    sprites.head.el = createAnimEl('anim-head', 'anim_head.png', sprites.head.frames);
    sprites.body.el = createAnimEl('anim-body', 'anim_body.png', sprites.body.frames);
    sprites.bottom.el = createAnimEl('anim-bottom', 'anim_bottom.png', sprites.bottom.frames);
    
    const createResSprite = (id, img, frames) => {
        let el = document.getElementById(id);
        if(!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'result-bg-anim';
            els.screens.result.insertBefore(el, els.screens.result.firstChild);
        }
        el.style.backgroundImage = `url('assets/${img}')`;
        el.style.backgroundSize = `${frames * CONFIG.REF_WIDTH}px ${CONFIG.REF_HEIGHT}px`;
        return el;
    }
    sprites.win.el = createResSprite('anim-win-bg', 'anim_win.png', sprites.win.frames);
    sprites.lose.el = createResSprite('anim-lose-bg', 'anim_lose.png', sprites.lose.frames);
}

function resizeGame() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const scale = Math.min(winW / CONFIG.REF_WIDTH, winH / CONFIG.REF_HEIGHT);
    if(els.container) {
        els.container.style.transform = `scale(${scale})`;
        els.container.style.transformOrigin = 'center center';
    }
}
window.addEventListener('resize', resizeGame);
loadBestScore();
resizeGame();

if (els.ui.btnStart) els.ui.btnStart.onclick = startGame;
if (els.ui.btnRetry) els.ui.btnRetry.onclick = startGame;
if (els.ui.btnNext) els.ui.btnNext.onclick = startGame;

// === 6. GAME CONTROL ===

function startGame() {
    audioSystem.init();
    initSprites();
    
    state.score = 0;
    state.timeRemaining = CONFIG.LEVEL_TIME;
    state.combo = 1.0;
    state.penaltyMultiplier = 1;
    state.isPlaying = true;
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + 1000;
    state.lastActionTime = Date.now();

    els.screens.menu.classList.remove('active');
    els.screens.result.classList.remove('active');
    els.screens.game.classList.add('active');
    
    els.ui.timerDigits.className = 'pixel-text timer-normal';
    if(els.ui.combo) els.ui.combo.classList.add('hidden');
    
    Object.values(els.icons).forEach(icon => { if(icon) icon.classList.add('hidden'); });
    updateScoreUI();
    
    stopGameLoops();
    timerIntervalId = setInterval(onSecondTick, 1000);
    gameLoop();
}

function stopGameLoops() {
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    if (resultAnimId) cancelAnimationFrame(resultAnimId);
    if (timerIntervalId) clearInterval(timerIntervalId);
    gameLoopId = null;
    resultAnimId = null;
    timerIntervalId = null;
}

function onSecondTick() {
    if (!state.isPlaying) return;
    state.timeRemaining--;
    els.ui.timerDigits.textContent = state.timeRemaining;
    
    if (state.timeRemaining <= 10) els.ui.timerDigits.className = 'pixel-text timer-crit';
    if (state.timeRemaining <= 0) finishGame();
}

function gameLoop() {
    if (!state.isPlaying) return;
    const now = Date.now();
    renderSprites();
    
    if (state.currentPhase === PHASES.TAP) {
        if (!state.tapTarget && now > state.tapNextSpawnTime) {
            spawnTapTarget();
        }
    }
    
    if (now >= state.phaseEndTime) {
        if (state.currentPhase === PHASES.WAIT) {
            pickNewPhase();
        } else {
            enterWaitPhase();
        }
    }

    if (now - state.lastActionTime > 2000) {
        if (state.combo > 1.0) {
            state.combo = Math.max(1.0, state.combo - 0.02);
            updateComboUI();
        }
    }

    if (state.currentPhase !== PHASES.WAIT) {
        const timeLeft = state.phaseEndTime - now;
        const pct = Math.max(0, (timeLeft / state.phaseTotalTime) * 100);
        els.ui.phaseBarFill.style.width = `${pct}%`;
    } else {
        els.ui.phaseBarFill.style.width = '0%';
    }
    
    gameLoopId = requestAnimationFrame(gameLoop);
}

// === 7. LOGIC (TAP, HEAD, BODY) ===

function spawnTapTarget() {
    const r = Math.random();
    let type = 'left';
    
    if (r > 0.7) type = 'double';     
    else if (r > 0.35) type = 'right'; 

    state.tapTarget = type;
    state.doubleTapLatch = 0; 

    if (type === 'left') {
        els.icons.tap1.classList.remove('hidden');
        els.icons.tap2.classList.add('hidden');
    } else if (type === 'right') {
        els.icons.tap1.classList.add('hidden');
        els.icons.tap2.classList.remove('hidden');
    } else if (type === 'double') {
        els.icons.tap1.classList.remove('hidden');
        els.icons.tap2.classList.remove('hidden');
    }
}

// === ИЗМЕНЕНИЕ 2: Обновленный Рендер с LERP ===
function renderSprites() {
    let anyActive = false;
    
    // Коэффициент плавности (меньше = плавнее/медленнее)
    const LERP_FACTOR = 0.3; 

    ['head', 'body', 'bottom'].forEach(name => {
        const s = sprites[name];
        if (!s.el) return;
        
        if (s.visible) {
            if (s.el.style.opacity !== '1') s.el.style.opacity = 1;
            anyActive = true;

            // Логика интерполяции
            if (name === 'head') {
                 // Для головы лерп не делаем из-за цикличности кадров, 
                 // так как мы поправили логику в processHead
                 s.frame = s.targetFrame; 
            } else {
                 // Плавный подгон кадра
                 s.frame += (s.targetFrame - s.frame) * LERP_FACTOR;
            }

            const displayFrame = Math.floor(s.frame);
            
            if (!isNaN(displayFrame)) {
                // Защита от вылета за пределы
                let safeFrame = Math.max(0, Math.min(s.frames - 1, displayFrame));
                const pixelShift = -(safeFrame * CONFIG.REF_WIDTH);
                
                // Оптимизация DOM: меняем только если нужно
                const newPos = `${pixelShift}px 0px`;
                if (s.el.style.backgroundPosition !== newPos) {
                    s.el.style.backgroundPosition = newPos;
                }
            }
        } else {
            if (s.el.style.opacity !== '0') s.el.style.opacity = 0;
        }
    });

    if (els.baseCucumber) {
        const targetOp = anyActive ? 0 : 1;
        if (els.baseCucumber.style.opacity != targetOp) {
            els.baseCucumber.style.opacity = targetOp;
        }
    }
}

function enterWaitPhase() {
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + CONFIG.PAUSE_TIME;
    state.phaseTotalTime = CONFIG.PAUSE_TIME;
    
    Object.values(els.icons).forEach(icon => { if(icon) icon.classList.add('hidden'); });
    sprites.head.visible = false;
    sprites.body.visible = false;
    sprites.bottom.visible = false;
    state.tapTarget = null;
    
    if(els.ui.phaseText) els.ui.phaseText.textContent = PHASE_TEXTS[PHASES.WAIT];
}

function pickNewPhase() {
    const phases = [PHASES.HEAD, PHASES.BODY, PHASES.TAP];
    let next = phases[Math.floor(Math.random() * phases.length)];
    if (next === state.lastPhase && Math.random() > 0.4) next = phases.find(p => p !== state.lastPhase);
    
    state.lastPhase = next;

    if (next === PHASES.TAP) {
        state.tapTarget = null;
        state.tapNextSpawnTime = Date.now() + 500;
        state.doubleTapLatch = 0;
        els.icons.tap1.classList.add('hidden');
        els.icons.tap2.classList.add('hidden');
    }

    state.currentPhase = next;
    state.phaseCounters = { headTicks: 0, bodyStrokes: 0 };
    state.strokeState = 0; 

    tg.HapticFeedback.impactOccurred('light');

    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    if (next === PHASES.HEAD) els.icons.head.classList.remove('hidden');
    if (next === PHASES.BODY) els.icons.body.classList.remove('hidden');
    
    if(els.ui.phaseText) els.ui.phaseText.textContent = PHASE_TEXTS[next];
}

// === 8. INPUT HANDLING ===

document.addEventListener('touchmove', function(e) { 
    if(e.target.closest('#game-container')) e.preventDefault(); 
}, { passive: false });

if(els.zones.head) els.zones.head.addEventListener('touchmove', (e) => handleInput(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchmove', (e) => handleInput(e, PHASES.BODY));

if(els.zones.tapLeft) els.zones.tapLeft.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
if(els.zones.tapRight) els.zones.tapRight.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));

if(els.zones.head) els.zones.head.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchstart', (e) => startBodyStroke(e));

window.addEventListener('touchend', () => {
    gestureData.headAngle = null;
    gestureData.bodyLastY = null;
    sprites.head.visible = false;
});

let gestureData = {
    headAngle: null, headAccumulator: 0, accFrameHead: 0,
    bodyLastY: null, bodyAccumulator: 0, strokeStartY: 0
};

function startBodyStroke(e) {
    if (state.currentPhase !== PHASES.BODY) { checkPenaltyTap(e, PHASES.BODY); return; }
    const touch = e.touches[0];
    gestureData.strokeStartY = touch.clientY;
    gestureData.bodyLastY = touch.clientY;
    gestureData.bodyAccumulator = 0;
}

function handleInput(e, zoneName) {
    if (!state.isPlaying || state.currentPhase === PHASES.WAIT) return;
    const touch = e.touches[0];
    
    if (state.currentPhase !== zoneName) {
        applyPenalty(touch, 1);
        return;
    }
    state.lastActionTime = Date.now();

    switch (zoneName) {
        case PHASES.HEAD: processHead(touch, e.currentTarget); break;
        case PHASES.BODY: processBody(touch, e.currentTarget); break;
        case PHASES.TAP: 
            const side = e.currentTarget.id === 'zone-tap-left' ? 'left' : 'right';
            processTapNew(touch, side); 
            break;
    }
}

function processTapNew(touch, zoneSide) {
    const now = Date.now();
    
    if (!state.tapTarget) {
        applyPenalty(touch, 0.5);
        return;
    }

    if (state.tapTarget === 'double') {
        if (state.doubleTapLatch === 0) {
            state.doubleTapLatch = now;
        } else {
            const diff = now - state.doubleTapLatch;
            if (diff < CONFIG.TAP_MECHANIC.DOUBLE_WINDOW) {
                completeTap('double', touch); 
            } else {
                state.doubleTapLatch = now; 
            }
        }
        return;
    }

    if (state.tapTarget === zoneSide) {
        completeTap(zoneSide, touch); 
    } else {
        applyPenalty(touch, 1); 
        shakeScreen();
    }
}

function completeTap(type, touch) {
    els.icons.tap1.classList.add('hidden');
    els.icons.tap2.classList.add('hidden');
    state.tapTarget = null;
    state.tapNextSpawnTime = Date.now() + CONFIG.TAP_MECHANIC.SPAWN_INTERVAL;

    const s = sprites.bottom;
    s.visible = true;
    s.el.style.opacity = 1;
    
    let f = 0;
    if (type === 'left') f = 1;
    else if (type === 'right') f = 2;
    else if (type === 'double') f = 3;
    
    // Синхронизируем и frame и targetFrame чтобы LERP не "уплыл"
    s.frame = f;
    s.targetFrame = f;

    const pixelShift = -(f * CONFIG.REF_WIDTH);
    s.el.style.backgroundPosition = `${pixelShift}px 0px`;

    setTimeout(() => { 
        if(state.currentPhase === PHASES.TAP) { s.visible = false; s.el.style.opacity = 0; }
    }, 150);

    let pts = CONFIG.SCORE.TAP;
    if (type === 'double') pts = CONFIG.SCORE.TAP_DOUBLE;

    audioSystem.play('tap');
    triggerSuccessCommon(pts, touch.clientX, touch.clientY);
    squashCucumber();
}

// === ИЗМЕНЕНИЕ 3: Исправленный HEAD (while loop) ===
function processHead(touch, target) {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
    
    if (gestureData.headAngle !== null) {
        let delta = angle - gestureData.headAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        
        gestureData.headAccumulator += Math.abs(delta);
        if (gestureData.headAccumulator > CONFIG.THRESHOLDS.HEAD) {
            triggerSuccessCommon(CONFIG.SCORE.HEAD_SPIN, touch.clientX, touch.clientY);
            audioSystem.play('head');
            gestureData.headAccumulator = 0;
            
            state.phaseCounters.headTicks++;
            if (state.phaseCounters.headTicks >= CONFIG.GOALS.HEAD_TICKS) {
                triggerBonus(CONFIG.SCORE.BONUS_GENTLE, "НЕЖНО!", 'text-gentle', 180, 200);
                state.phaseCounters.headTicks = 0;
            }
        }

        gestureData.accFrameHead += delta;
        // WHILE: обрабатываем все накопленное движение
        while (Math.abs(gestureData.accFrameHead) > CONFIG.SCRUB.HEAD_STEP) {
            const dir = gestureData.accFrameHead > 0 ? 1 : -1;
            const s = sprites.head;
            if (s && s.el) {
                s.visible = true;
                
                // Двигаем targetFrame
                s.targetFrame += dir;
                
                // Цикл (Wrap)
                if (s.targetFrame >= s.frames) s.targetFrame = 0;
                if (s.targetFrame < 0) s.targetFrame = s.frames - 1;
                
                // Мгновенная синхронизация при большом скачке (wrap around)
                if (Math.abs(s.targetFrame - s.frame) > s.frames / 2) {
                    s.frame = s.targetFrame; 
                }
            }
            // Вычитаем шаг, сохраняя остаток
            gestureData.accFrameHead -= (dir * CONFIG.SCRUB.HEAD_STEP);
        }
    }
    gestureData.headAngle = angle;
}

// === ИЗМЕНЕНИЕ 4: Исправленный BODY (Padding + Remap) ===
function processBody(touch, target) {
    const y = touch.clientY;
    const rect = target.getBoundingClientRect();
    
    // Процент положения пальца
    let percent = (y - rect.top) / rect.height;
    
    // REMAP: Добавляем отступы (padding), чтобы легче достигать краев (0% и 100%)
    // 0.15 = 15% сверху и снизу считаются "краем"
    const padding = 0.15; 
    let visualPercent = (percent - padding) / (1.0 - (padding * 2));
    visualPercent = Math.max(0, Math.min(1, visualPercent));

    const s = sprites.body;
    if (s && s.el) {
        s.visible = true;
        // Устанавливаем ЦЕЛЬ анимации
        s.targetFrame = visualPercent * (s.frames - 1);
    }
    
    // Логика "Идеальной дрочки" остается на реальном проценте
    const isAtTop = percent < CONFIG.THRESHOLDS.BODY_TOP_LIMIT;    
    const isAtBottom = percent > CONFIG.THRESHOLDS.BODY_BOTTOM_LIMIT; 
    
    if (isAtTop) {
        if (state.strokeState === 2) {
            state.phaseCounters.bodyStrokes++;
            if (state.phaseCounters.bodyStrokes >= CONFIG.GOALS.BODY_STROKES) {
                triggerBonus(CONFIG.SCORE.BODY_BONUS, "ИДЕАЛЬНАЯ ДРОЧКА!", 'text-perfect', 180, 320);
                state.phaseCounters.bodyStrokes = 0; 
            }
        }
        state.strokeState = 1; 
    } else if (isAtBottom) {
        state.strokeState = 2; 
    }

    if (gestureData.bodyLastY !== null) {
        const delta = Math.abs(y - gestureData.bodyLastY);
        gestureData.bodyAccumulator += delta;
        if (gestureData.bodyAccumulator > CONFIG.THRESHOLDS.BODY) {
            triggerSuccessCommon(CONFIG.SCORE.BODY_RUB, touch.clientX, touch.clientY);
            audioSystem.play('body');
            gestureData.bodyAccumulator = 0;
        }
    }
    gestureData.bodyLastY = y;
}

function checkPenaltyTap(e, zoneName) {
    if (state.currentPhase !== zoneName && state.currentPhase !== PHASES.WAIT) {
        applyPenalty(e.touches[0], 2);
    }
}

function applyPenalty(touch, severity) {
    state.penaltyMultiplier += 0.1;
    state.combo = 1.0; 
    updateComboUI();
    const penalty = Math.floor(CONFIG.SCORE.PENALTY_BASE * severity * state.penaltyMultiplier);
    
    state.score -= penalty;
    updateScoreUI();
    
    if (Math.random() > 0.7) { 
        spawnFloatingText(`-${penalty}`, touch.clientX, touch.clientY, 'text-penalty');
        tg.HapticFeedback.notificationOccurred('error');
        shakeScreen();
    }
}

function triggerSuccessCommon(points, x, y) {
    state.combo = Math.min(state.combo + 0.05, CONFIG.SCORE.MAX_COMBO);
    updateComboUI();
    
    const finalPts = Math.floor(points * state.combo);
    state.score += finalPts;
    updateScoreUI();

    if (Math.random() > 0.6) spawnFloatingText(`+${finalPts}`, x, y, 'text-score');
    tg.HapticFeedback.impactOccurred('medium');
}

function triggerBonus(points, text, cssClass, x, y) {
    state.score += points;
    updateScoreUI();
    spawnFloatingText(`${text} +${points}`, x, y, cssClass);
    shakeScreen();
    tg.HapticFeedback.notificationOccurred('success');
}

// === 9. UI & HELPERS ===
function updateScoreUI() {
    els.ui.scoreText.textContent = `${state.score} / ${CONFIG.WIN_SCORE}`;
    const pct = Math.min(100, (Math.max(0, state.score) / CONFIG.WIN_SCORE) * 100);
    els.ui.progressFill.style.width = `${pct}%`;
}

function updateComboUI() {
    if (els.ui.combo) {
        if (state.combo >= 1.1) {
            els.ui.combo.textContent = `x${state.combo.toFixed(1)}`;
            els.ui.combo.classList.remove('hidden');
        } else {
            els.ui.combo.classList.add('hidden');
        }
    }
}

function shakeScreen() {
    if(!els.world) return;
    els.world.classList.remove('shake-effect');
    void els.world.offsetWidth;
    els.world.classList.add('shake-effect');
}

function squashCucumber() {
    if(!els.baseCucumber) return;
    els.baseCucumber.classList.remove('squash-effect');
    void els.baseCucumber.offsetWidth;
    els.baseCucumber.classList.add('squash-effect');
    setTimeout(() => {
        if(els.baseCucumber) els.baseCucumber.classList.remove('squash-effect');
    }, 100);
}

function spawnFloatingText(text, x, y, className) {
    const el = document.createElement('div');
    el.textContent = text;
    el.className = `floating-text ${className}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    els.particles.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

function finishGame() {
    stopGameLoops();
    state.isPlaying = false;
    
    saveBestScore();
    loadBestScore();

    els.screens.game.classList.remove('active');
    els.screens.result.classList.add('active');
    els.ui.resultScore.textContent = state.score;
    
    sprites.head.visible = false; 
    sprites.body.visible = false; 
    sprites.bottom.visible = false;
    if(els.baseCucumber) els.baseCucumber.style.opacity = 1;

    const isWin = state.score >= CONFIG.WIN_SCORE;
    
    if (sprites.win.el) sprites.win.el.style.display = 'none';
    if (sprites.lose.el) sprites.lose.el.style.display = 'none';
    
    let activeResSprite = null;

    if (isWin) {
        audioSystem.play('win');
        activeResSprite = sprites.win;
        els.ui.resultTitle.textContent = "C-U-M-S-H-O-T!!!";
        els.ui.resultTitle.className = "win-text";
        els.ui.resultMsg.textContent = "ПОДРОЧЕНО!";
        if(els.ui.btnNext) els.ui.btnNext.classList.remove('hidden');
        if(els.ui.btnRetry) els.ui.btnRetry.classList.add('hidden');
    } else {
        audioSystem.play('lose');
        activeResSprite = sprites.lose;
        els.ui.resultTitle.textContent = "Не получилось кончить...";
        els.ui.resultTitle.className = "lose-text";
        els.ui.resultMsg.textContent = "Старайся лучше!";
        if(els.ui.btnNext) els.ui.btnNext.classList.add('hidden');
        if(els.ui.btnRetry) els.ui.btnRetry.classList.remove('hidden');
    }
    
    if(activeResSprite && activeResSprite.el) {
        activeResSprite.el.style.display = 'block';
        activeResSprite.visible = true; 
        activeResSprite.frame = 0;
        activeResSprite.targetFrame = 0;
    }

    const resultLoop = () => {
        if (!state.isPlaying && els.screens.result.classList.contains('active')) {
            if (activeResSprite && activeResSprite.el) {
                activeResSprite.frame += 0.2;
                if (activeResSprite.frame >= activeResSprite.frames) activeResSprite.frame = 0;
                const shift = -(Math.floor(activeResSprite.frame) * CONFIG.REF_WIDTH);
                activeResSprite.el.style.backgroundPosition = `${shift}px 0px`;
            }
            resultAnimId = requestAnimationFrame(resultLoop);
        }
    };
    resultLoop();
}