/* ==================================================================
   COCKUMBER RUBBER - CORE v16.0 (Arcade Engine)
   (Fuel-based Animation, Auto-Gravity, Ping-Pong Loops)
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
    WIN_SCORE: 2000,
    
    SCORE: {
        HEAD_SPIN: 2,
        BODY_RUB: 1,
        BODY_BONUS: 69, 
        TAP: 5,            
        TAP_DOUBLE: 15,    
        PENALTY_BASE: 15,
        MAX_COMBO: 3.5,    
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

    // НАСТРОЙКИ АРКАДНОГО ДВИЖКА
    ENGINE: {
        // Скорость воспроизведения (кадров за тик) при активном пальце
        PLAY_SPEED_BODY: 0.45, 
        PLAY_SPEED_HEAD: 0.4,
        
        // Скорость возврата к 0 (Гравитация), когда палец не двигается
        GRAVITY_BODY: 0.6,
        GRAVITY_HEAD: 0.5,

        // Насколько быстро затухает "энергия" движения (0.0 - 1.0)
        INPUT_DECAY: 0.85 
    },
    
    GOALS: {
        BODY_STROKES: 8, // Сколько полных циклов (0-9-0) нужно для бонуса
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
    
    // Новые переменные движка
    inputEnergy: 0, // 0.0 - 1.0 (есть ли движение пальцем)
    
    // Состояние анимации Ствола
    bodyDir: 1,     // 1 = вверх (к 9 кадру), -1 = вниз (к 0 кадру)
    hitTop: false,  // Флаг: достигли ли верха в этом цикле

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

// floatFrame - текущий точный кадр для плавности
let sprites = {
    head:   { frame: 0, floatFrame: 0, el: null, frames: CONFIG.FRAMES.head, visible: false },
    body:   { frame: 0, floatFrame: 0, el: null, frames: CONFIG.FRAMES.body, visible: false },
    bottom: { frame: 0, floatFrame: 0, el: null, frames: CONFIG.FRAMES.bottom, visible: false },
    win:    { frame: 0, floatFrame: 0, el: null, frames: CONFIG.FRAMES.win, visible: false },
    lose:   { frame: 0, floatFrame: 0, el: null, frames: CONFIG.FRAMES.lose, visible: false }
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
    state.inputEnergy = 0;

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
    
    // === ГЛАВНЫЙ ФИЗИЧЕСКИЙ ЦИКЛ ===
    if (state.currentPhase === PHASES.BODY) {
        updateBodyPhysics();
    } else if (state.currentPhase === PHASES.HEAD) {
        updateHeadPhysics();
    }
    
    renderSprites();
    
    // Затухание энергии ввода (если игрок перестал тереть)
    state.inputEnergy *= CONFIG.ENGINE.INPUT_DECAY;
    if (state.inputEnergy < 0.05) state.inputEnergy = 0;

    // --- ЛОГИКА ТАПА ---
    if (state.currentPhase === PHASES.TAP) {
        if (!state.tapTarget && now > state.tapNextSpawnTime) {
            spawnTapTarget();
        }
    }
    
    // --- СМЕНА ФАЗ ---
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

// === 7. АРКАДНАЯ ФИЗИКА (BODY & HEAD) ===

function updateBodyPhysics() {
    const s = sprites.body;
    if (!s) return;
    
    s.visible = true;
    
    // Есть энергия (игрок трет)?
    if (state.inputEnergy > 0.1) {
        // Двигаем кадр вперед или назад в зависимости от направления
        const speed = CONFIG.ENGINE.PLAY_SPEED_BODY;
        s.floatFrame += speed * state.bodyDir;
        
        // --- ЛОГИКА PING-PONG (0 -> 9 -> 0) ---
        
        // Удар о ВЕРХ (9 кадр)
        if (s.floatFrame >= s.frames - 1) {
            s.floatFrame = s.frames - 1; // Limit
            state.bodyDir = -1; // Разворот вниз
            state.hitTop = true; // Запомнили, что коснулись верха
        }
        
        // Удар о НИЗ (0 кадр)
        if (s.floatFrame <= 0) {
            s.floatFrame = 0; // Limit
            
            if (state.bodyDir === -1) {
                // Если мы шли вниз и ударились о дно
                state.bodyDir = 1; // Разворот вверх
                
                // ПРОВЕРКА КОМБО: Если мы до этого были наверху (hitTop)
                if (state.hitTop) {
                    state.hitTop = false; // Сброс
                    // УРА! Полный цикл завершен
                    state.phaseCounters.bodyStrokes++;
                    
                    // Награда за движение
                    triggerSuccessCommon(CONFIG.SCORE.BODY_RUB, 180, 320);
                    if(Math.random() > 0.6) audioSystem.play('body');

                    // Награда за ИДЕАЛЬНУЮ серию
                    if (state.phaseCounters.bodyStrokes >= CONFIG.GOALS.BODY_STROKES) {
                        triggerBonus(CONFIG.SCORE.BODY_BONUS, "ИДЕАЛЬНАЯ ДРОЧКА!", 'text-perfect', 180, 320);
                        state.phaseCounters.bodyStrokes = 0; 
                    }
                }
            }
        }
    } 
    else {
        // ГРАВИТАЦИЯ: Если игрок не трет, шкурка падает на 0
        if (s.floatFrame > 0) {
            s.floatFrame -= CONFIG.ENGINE.GRAVITY_BODY;
            if (s.floatFrame < 0) s.floatFrame = 0;
            // При падении сбрасываем логику комбо, чтобы не абузили
            state.bodyDir = 1; // При следующем старте всегда вверх
        }
    }
}

function updateHeadPhysics() {
    const s = sprites.head;
    if (!s) return;
    
    s.visible = true;
    
    if (state.inputEnergy > 0.1) {
        // Просто крутим вперед
        s.floatFrame += CONFIG.ENGINE.PLAY_SPEED_HEAD;
        
        // Зацикливаем 0-9
        if (s.floatFrame >= s.frames) {
            s.floatFrame = 0; // Seamless loop
            
            // За каждый полный оборот
            state.phaseCounters.headTicks++;
            triggerSuccessCommon(CONFIG.SCORE.HEAD_SPIN, 180, 150);
            if(Math.random() > 0.6) audioSystem.play('head');

            if (state.phaseCounters.headTicks >= CONFIG.GOALS.HEAD_TICKS / 3) {
                 // Упростил условие для динамики
                 triggerBonus(CONFIG.SCORE.BONUS_GENTLE, "НЕЖНО!", 'text-gentle', 180, 200);
                 state.phaseCounters.headTicks = 0;
            }
        }
    } 
    else {
        // УПРУГОСТЬ: Возврат к 0
        // Ищем кратчайший путь к 0, но для простоты просто отматываем назад
        if (s.floatFrame > 0.1) {
            s.floatFrame -= CONFIG.ENGINE.GRAVITY_HEAD;
            if (s.floatFrame < 0) s.floatFrame = 0;
        } else {
            s.floatFrame = 0;
        }
    }
}


// === 8. INPUT HANDLING (ЭНЕРГИЯ) ===

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

function renderSprites() {
    let anyActive = false;
    
    ['head', 'body', 'bottom'].forEach(name => {
        const s = sprites[name];
        if (!s.el) return;
        
        if (s.visible) {
            if (s.el.style.opacity !== '1') s.el.style.opacity = 1;
            anyActive = true;

            // Просто отображаем то, что насчитал физический движок
            let displayFrame = Math.floor(s.floatFrame);
            
            // Safety
            if(displayFrame < 0) displayFrame = 0;
            if(displayFrame >= s.frames) displayFrame = s.frames - 1;
            
            const pixelShift = -(displayFrame * CONFIG.REF_WIDTH);
            const newPos = `${pixelShift}px 0px`;
            
            if (s.el.style.backgroundPosition !== newPos) {
                s.el.style.backgroundPosition = newPos;
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
    state.inputEnergy = 0; // Сброс энергии
    
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
    } else if (next === PHASES.BODY) {
        // Сброс физики тела
        sprites.body.floatFrame = 0;
        state.bodyDir = 1;
        state.hitTop = false;
    } else if (next === PHASES.HEAD) {
        sprites.head.floatFrame = 0;
    }

    state.currentPhase = next;
    state.phaseCounters = { headTicks: 0, bodyStrokes: 0 };
    state.inputEnergy = 0;
    
    tg.HapticFeedback.impactOccurred('light');

    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    if (next === PHASES.HEAD) els.icons.head.classList.remove('hidden');
    if (next === PHASES.BODY) els.icons.body.classList.remove('hidden');
    
    if(els.ui.phaseText) els.ui.phaseText.textContent = PHASE_TEXTS[next];
}

// === 9. INPUT HANDLING (УПРОЩЕННЫЙ) ===

// Блокируем скролл
document.addEventListener('touchmove', function(e) { 
    if(e.target.closest('#game-container')) e.preventDefault(); 
}, { passive: false });

// Слушаем ввод для всех фаз
if(els.zones.head) els.zones.head.addEventListener('touchmove', (e) => handleEnergyInput(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchmove', (e) => handleEnergyInput(e, PHASES.BODY));

// Для тапов оставляем клики
if(els.zones.tapLeft) els.zones.tapLeft.addEventListener('touchstart', (e) => handleTapInput(e, PHASES.TAP));
if(els.zones.tapRight) els.zones.tapRight.addEventListener('touchstart', (e) => handleTapInput(e, PHASES.TAP));

// Штрафы за не ту зону (клики)
if(els.zones.head) els.zones.head.addEventListener('touchstart', (e) => {
    if (state.currentPhase !== PHASES.HEAD) checkPenaltyTap(e, PHASES.HEAD);
});
if(els.zones.body) els.zones.body.addEventListener('touchstart', (e) => {
    if (state.currentPhase !== PHASES.BODY) checkPenaltyTap(e, PHASES.BODY);
});


// Функция для накачки энергии (просто от движения)
function handleEnergyInput(e, zoneName) {
    if (!state.isPlaying || state.currentPhase === PHASES.WAIT) return;
    
    // Если зона совпадает
    if (state.currentPhase === zoneName) {
        // Просто ставим энергию на максимум.
        // Пока игрок двигает пальцем (события touchmove летят) - энергия полная.
        // Как только перестанет - она начнет падать в gameLoop.
        state.inputEnergy = 1.0; 
        state.lastActionTime = Date.now();
    } else {
        // Если трет не там - не наказываем сразу штрафом, но энергия не идет
        // (Штраф только за Тап/Клик, чтобы не бесить случайными задеваниями)
    }
}

function handleTapInput(e, zoneName) {
    if (!state.isPlaying || state.currentPhase === PHASES.WAIT) return;
    const touch = e.touches[0];
    
    if (state.currentPhase !== zoneName) {
        applyPenalty(touch, 1);
        return;
    }
    state.lastActionTime = Date.now();

    // Тап логика
    const side = e.currentTarget.id === 'zone-tap-left' ? 'left' : 'right';
    processTapNew(touch, side); 
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
    
    s.frame = f;
    s.floatFrame = f;

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

// === 10. UI & HELPERS ===
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
        activeResSprite.floatFrame = 0;
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