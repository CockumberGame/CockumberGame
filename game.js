window.onerror = function(msg, url, line) {
   return false;
};

/* ==================================================================
   COCKUMBER RUBBER - CORE v7.0 (INSTANT AUDIO & PERFECT STROKE FIX)
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
        BODY_BONUS: 100,
        TAP: 3,
        PENALTY_BASE: 10,
        MAX_COMBO: 1.5
    },

    FRAMES: {
        head: 5, body: 9, bottom: 2, win: 10, lose: 6
    },

    SCRUB: { HEAD_STEP: 0.4 },
    
    THRESHOLDS: {
        HEAD: 0.6, 
        BODY: 20, 
        // 70% от высоты зоны (260px * 0.7 = ~180px)
        // Нужно провести 180px не отпуская, чтобы получить бонус
        BODY_PERFECT_RATIO: 0.7 
    },

    PHASE_MIN_TIME: 3000,
    PHASE_MAX_TIME: 6000,
    PAUSE_TIME: 1000
};

const PHASES = { HEAD: 'head', BODY: 'body', TAP: 'tap', WAIT: 'wait' };

// === 2. STATE ===
let state = {
    isPlaying: false,
    score: 0,
    timeRemaining: CONFIG.LEVEL_TIME,
    currentPhase: PHASES.WAIT,
    phaseEndTime: 0,
    penaltyMultiplier: 1,
    combo: 1.0
};

// Звуки
const audio = { head: [], body: [], tap: [], win: null, lose: null };

// Спрайты
let sprites = {
    head:   { frame: 0, el: null, frames: CONFIG.FRAMES.head, visible: false },
    body:   { frame: 0, el: null, frames: CONFIG.FRAMES.body, visible: false },
    bottom: { frame: 0, el: null, frames: CONFIG.FRAMES.bottom, visible: false },
    win:    { frame: 0, el: null, frames: CONFIG.FRAMES.win, visible: false },
    lose:   { frame: 0, el: null, frames: CONFIG.FRAMES.lose, visible: false }
};

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
        phaseBarContainer: getEl('phase-timer-container'),
        resultScore: getEl('result-score-val'),
        resultTitle: getEl('result-title'),
        resultMsg: getEl('result-message'),
        btnRetry: getEl('btn-retry'),
        btnNext: getEl('btn-next'),
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

// === 3. INIT ===
function initAudio() {
    const load = (path) => {
        const a = new Audio(path);
        a.volume = 0.9;
        a.onerror = () => {}; 
        return a;
    };
    audio.head = []; audio.body = []; audio.tap = [];
    for(let i=1; i<=3; i++) {
        audio.head.push(load(`assets/sfx_head_${i}.mp3`));
        audio.body.push(load(`assets/sfx_body_${i}.mp3`));
        audio.tap.push(load(`assets/sfx_tap_${i}.mp3`));
    }
    audio.win = load('assets/sfx_win.mp3');
    audio.lose = load('assets/sfx_lose.mp3');
}

function initSprites() {
    const world = document.getElementById('world-layer');
    if(!world) return;
    
    const createAnimEl = (id, imgName, frameCount) => {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'anim-sprite';
            world.appendChild(el);
        }
        
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '360px'; 
        el.style.height = '640px'; 
        el.style.backgroundImage = `url('assets/${imgName}')`;
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundSize = `${frameCount * 360}px 640px`;
        el.style.backgroundPosition = `0px 0px`;
        return el;
    };

    sprites.head.el = createAnimEl('anim-head', 'anim_head.png', sprites.head.frames);
    sprites.body.el = createAnimEl('anim-body', 'anim_body.png', sprites.body.frames);
    sprites.bottom.el = createAnimEl('anim-bottom', 'anim_bottom.png', sprites.bottom.frames);
    
    const resContent = document.querySelector('.result-content');
    if (resContent) {
        const setupResultSprite = (id, img, frames) => {
            let old = document.getElementById(id);
            if(old) old.remove();
            let el = document.createElement('div');
            el.id = id;
            el.style.position = 'relative';
            el.style.width = '200px';
            el.style.height = '200px';
            el.style.backgroundImage = `url('assets/${img}')`;
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundSize = `${frames * 100}% 100%`; 
            el.style.display = 'none';
            el.style.imageRendering = 'pixelated';
            resContent.insertBefore(el, els.ui.resultScore.parentNode);
            return el;
        };
        sprites.win.el = setupResultSprite('anim-win', 'anim_win.png', sprites.win.frames);
        sprites.lose.el = setupResultSprite('anim-lose', 'anim_lose.png', sprites.lose.frames);
    }
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
resizeGame();

// === 4. GAME LOOP ===
if (getEl('btn-start')) getEl('btn-start').onclick = startGame;
if (getEl('btn-retry')) getEl('btn-retry').onclick = startGame;
if (getEl('btn-next')) getEl('btn-next').onclick = startGame;

function startGame() {
    initAudio();
    initSprites();
    
    state.score = 0;
    state.timeRemaining = CONFIG.LEVEL_TIME;
    state.combo = 1.0;
    state.penaltyMultiplier = 1;
    state.isPlaying = true;
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + 1000;

    els.screens.menu.classList.remove('active');
    els.screens.result.classList.remove('active');
    els.screens.game.classList.add('active');
    els.ui.timerDigits.className = 'pixel-text timer-normal';
    
    Object.values(els.icons).forEach(icon => { if(icon) icon.classList.add('hidden'); });
    updateScoreUI();
    
    if (window.loopId) cancelAnimationFrame(window.loopId);
    if (window.secTimerId) clearInterval(window.secTimerId);
    window.secTimerId = setInterval(onSecondTick, 1000);
    gameLoop();
}

function onSecondTick() {
    if (!state.isPlaying) return;
    state.timeRemaining--;
    els.ui.timerDigits.textContent = state.timeRemaining;
    if (state.timeRemaining <= 10) els.ui.timerDigits.className = 'pixel-text timer-crit';
    else if (state.timeRemaining <= 20) els.ui.timerDigits.className = 'pixel-text timer-orange';
    if (state.timeRemaining <= 0) finishGame();
}

function gameLoop() {
    if (!state.isPlaying) return;
    const now = Date.now();
    renderSprites();
    
    if (now >= state.phaseEndTime) {
        state.currentPhase === PHASES.WAIT ? pickNewPhase() : enterWaitPhase();
    }

    if (state.currentPhase !== PHASES.WAIT) {
        const timeLeft = state.phaseEndTime - now;
        const totalTime = state.phaseTotalTime;
        const pct = Math.max(0, (timeLeft / totalTime) * 100);
        els.ui.phaseBarFill.style.width = `${pct}%`;
    } else {
        els.ui.phaseBarFill.style.width = '0%';
    }
    window.loopId = requestAnimationFrame(gameLoop);
}

// === 5. RENDER & SPRITES ===
function renderSprites() {
    if (els.screens.result.classList.contains('active')) {
        ['win', 'lose'].forEach(name => {
            const s = sprites[name];
            if(s.visible && s.el) {
                s.frame += 0.2; 
                if (s.frame >= s.frames) s.frame = 0;
                const currentFrame = Math.floor(s.frame);
                if (s.frames > 1) {
                    const pos = (100 / (s.frames - 1)) * currentFrame;
                    s.el.style.backgroundPosition = `${pos}% 0%`;
                }
            }
        });
        return;
    }

    let anyActive = false;
    ['head', 'body', 'bottom'].forEach(name => {
        const s = sprites[name];
        if (!s.el) return;
        if (s.visible) {
            s.el.style.opacity = 1;
            anyActive = true;
            const currentFrame = Math.floor(s.frame);
            const pixelShift = -(currentFrame * 360);
            s.el.style.backgroundPosition = `${pixelShift}px 0px`;
        } else {
            s.el.style.opacity = 0;
        }
    });

    if (els.baseCucumber) {
        els.baseCucumber.style.opacity = anyActive ? 0 : 1;
    }
}

function scrubSprite(name, deltaFrames) {
    const s = sprites[name];
    if (!s || !s.el) return;
    s.visible = true;
    s.frame += deltaFrames;
    if (s.frame >= s.frames) s.frame = 0;
    if (s.frame < 0) s.frame = s.frames - 1;
}

function mapSpriteToPosition(name, percent) {
    const s = sprites[name];
    if (!s || !s.el) return;
    s.visible = true;
    let targetFrame = Math.floor(percent * s.frames);
    if (targetFrame < 0) targetFrame = 0;
    if (targetFrame >= s.frames) targetFrame = s.frames - 1;
    s.frame = targetFrame;
}

function enterWaitPhase() {
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + CONFIG.PAUSE_TIME;
    Object.values(els.icons).forEach(icon => { if(icon) icon.classList.add('hidden'); });
    sprites.head.visible = false;
    sprites.body.visible = false;
    sprites.bottom.visible = false;
}

function pickNewPhase() {
    const phases = [PHASES.HEAD, PHASES.BODY, PHASES.TAP];
    let next = phases[Math.floor(Math.random() * phases.length)];
    if (next === state.lastPhase && Math.random() > 0.4) next = phases.find(p => p !== state.lastPhase);
    state.lastPhase = next;
    state.currentPhase = next;
    
    tg.HapticFeedback.impactOccurred('light');

    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    if (next === PHASES.HEAD && els.icons.head) els.icons.head.classList.remove('hidden');
    if (next === PHASES.BODY && els.icons.body) els.icons.body.classList.remove('hidden');
    if (next === PHASES.TAP) {
        if(els.icons.tap1) els.icons.tap1.classList.remove('hidden');
        if(els.icons.tap2) els.icons.tap2.classList.remove('hidden');
    }
}

// === IMPROVED SOUND LOGIC ===
function playZoneSound(type) {
    let pool = audio[type];
    if (!pool || pool.length === 0) return;

    // Для ТАПОВ разрешаем наложение звуков (Machine Gun Effect)
    if (type === PHASES.TAP) {
        // Клонируем ноду для полифонии, если все заняты
        const freeSnd = pool.find(s => s.paused) || pool[0].cloneNode();
        freeSnd.currentTime = 0;
        freeSnd.volume = 1.0;
        freeSnd.play().catch(()=>{});
        return;
    }

    // Для остальных зон - играем, только если есть свободный слот, 
    // или если прошло достаточно времени (чтобы не было каши)
    if (pool.some(snd => !snd.paused)) return;

    const snd = pool[Math.floor(Math.random() * pool.length)];
    snd.currentTime = 0;
    snd.play().catch(()=>{});
}


// === 6. INPUT HANDLING ===

document.addEventListener('touchmove', function(e) { 
    if(e.target.closest('#game-container')) e.preventDefault(); 
}, { passive: false });

if(els.zones.head) els.zones.head.addEventListener('touchmove', (e) => handleInput(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchmove', (e) => handleInput(e, PHASES.BODY));
if(els.zones.tapLeft) els.zones.tapLeft.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
if(els.zones.tapRight) els.zones.tapRight.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));

if(els.zones.head) els.zones.head.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchstart', (e) => startBodyStroke(e));
if(els.zones.body) els.zones.body.addEventListener('touchend', (e) => endBodyStroke(e));

window.addEventListener('touchend', () => {
    gestureData.headAngle = null;
    gestureData.bodyLastY = null;
    if (state.currentPhase === PHASES.BODY) sprites.body.visible = false;
    sprites.head.visible = false;
});

let gestureData = {
    headAngle: null, headAccumulator: 0, accFrameHead: 0,
    bodyLastY: null, bodyAccumulator: 0,
    // Бонусные данные
    strokeStartY: 0,
    strokeDistance: 0,
    strokeDir: 0 // 1 - вниз, -1 - вверх
};

function startBodyStroke(e) {
    if (state.currentPhase !== PHASES.BODY) {
        checkPenaltyTap(e, PHASES.BODY);
        return;
    }
    const touch = e.touches[0];
    gestureData.strokeStartY = touch.clientY;
    gestureData.strokeDistance = 0;
    gestureData.strokeDir = 0;
}

function endBodyStroke(e) {
    // Сброс
    gestureData.strokeDistance = 0;
}

function handleInput(e, zoneName) {
    if (!state.isPlaying || state.currentPhase === PHASES.WAIT) return;
    const touch = e.touches[0];
    if (state.currentPhase !== zoneName) {
        applyPenalty(touch, 1);
        return;
    }
    switch (zoneName) {
        case PHASES.HEAD: processHead(touch, e.currentTarget); break;
        case PHASES.BODY: processBody(touch, e.currentTarget); break;
        case PHASES.TAP: processTap(touch); break;
    }
}

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
            triggerSuccess(PHASES.HEAD, touch.clientX, touch.clientY);
            gestureData.headAccumulator = 0;
        }

        gestureData.accFrameHead += delta;
        if (Math.abs(gestureData.accFrameHead) > CONFIG.SCRUB.HEAD_STEP) {
            const dir = gestureData.accFrameHead > 0 ? 1 : -1;
            scrubSprite('head', dir);
            gestureData.accFrameHead = 0;
        }
    }
    gestureData.headAngle = angle;
}

function processBody(touch, target) {
    const y = touch.clientY;
    const rect = target.getBoundingClientRect();
    let percent = (y - rect.top) / rect.height;
    mapSpriteToPosition('body', percent);
    
    // --- PERFECT STROKE LOGIC (V7) ---
    if (gestureData.bodyLastY !== null) {
        const delta = y - gestureData.bodyLastY;
        const currentDir = delta > 0 ? 1 : -1;

        if (Math.abs(delta) > 1) { // Игнорируем микро-дрожание
            if (gestureData.strokeDir !== 0 && currentDir !== gestureData.strokeDir) {
                // Смена направления - сбрасываем бонус
                gestureData.strokeStartY = y;
                gestureData.strokeDistance = 0;
            }
            gestureData.strokeDir = currentDir;
            gestureData.strokeDistance = Math.abs(y - gestureData.strokeStartY);

            // Проверка на бонус (70% от высоты зоны)
            const requiredDist = rect.height * CONFIG.THRESHOLDS.BODY_PERFECT_RATIO;
            
            if (gestureData.strokeDistance > requiredDist) {
                triggerSuccess(PHASES.BODY, 180, 320, true);
                // Сбрасываем, чтобы не спамить бонусами на одном движении
                gestureData.strokeStartY = y; 
                gestureData.strokeDistance = 0;
            }
        }
    }
    // ---------------------------------

    if (gestureData.bodyLastY !== null) {
        const delta = Math.abs(y - gestureData.bodyLastY);
        gestureData.bodyAccumulator += delta;
        if (gestureData.bodyAccumulator > CONFIG.THRESHOLDS.BODY) {
            triggerSuccess(PHASES.BODY, touch.clientX, touch.clientY);
            gestureData.bodyAccumulator = 0;
        }
    }
    gestureData.bodyLastY = y;
}

function processTap(touch) {
    triggerSuccess(PHASES.TAP, touch.clientX, touch.clientY);
    squashCucumber();
    
    const s = sprites.bottom;
    s.visible = true;
    s.frame = 1;
    setTimeout(() => { if(s.visible) s.frame = 0; }, 100);
    setTimeout(() => { 
        if (state.currentPhase !== PHASES.TAP) s.visible = false;
    }, 200);
}

function checkPenaltyTap(e, zoneName) {
    if (state.currentPhase !== zoneName && state.currentPhase !== PHASES.WAIT) {
        applyPenalty(e.touches[0], 2);
    }
}

function applyPenalty(touch, severity) {
    state.penaltyMultiplier += 0.1;
    const penalty = Math.floor(CONFIG.SCORE.PENALTY_BASE * severity * state.penaltyMultiplier);
    
    if (Math.random() > 0.7) { 
        state.score = Math.max(0, state.score - penalty);
        updateScoreUI();
        spawnFloatingText(`-${penalty}`, touch.clientX, touch.clientY, 'text-penalty');
        tg.HapticFeedback.notificationOccurred('error');
        shakeScreen();
    }
}

function triggerSuccess(type, x, y, isBonus = false) {
    let pts = 0;
    
    if (isBonus) {
        pts = CONFIG.SCORE.BODY_BONUS;
        // JUICE: Тряска и мощная вибрация
        spawnFloatingText(`PERFECT! +${pts}`, 180, 320, 'text-perfect');
        tg.HapticFeedback.notificationOccurred('success');
        shakeScreen();
    } else {
        if (type === PHASES.HEAD) pts = CONFIG.SCORE.HEAD_SPIN;
        if (type === PHASES.BODY) pts = CONFIG.SCORE.BODY_RUB;
        if (type === PHASES.TAP) pts = CONFIG.SCORE.TAP;
        playZoneSound(type);
        // JUICE: Обычная вибрация
        tg.HapticFeedback.impactOccurred('medium');
    }
    
    state.combo = Math.min(state.combo + 0.05, CONFIG.SCORE.MAX_COMBO);
    const finalPts = Math.floor(pts * state.combo);
    state.score += finalPts;
    updateScoreUI();

    if (!isBonus && Math.random() > 0.6) spawnFloatingText(`+${finalPts}`, x, y, 'text-score');
}

// === EFFECTS ===
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

function updateScoreUI() {
    els.ui.scoreText.textContent = `${state.score} / ${CONFIG.WIN_SCORE}`;
    const pct = Math.min(100, (state.score / CONFIG.WIN_SCORE) * 100);
    els.ui.progressFill.style.width = `${pct}%`;
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
    state.isPlaying = false;
    clearInterval(window.secTimerId);
    cancelAnimationFrame(window.loopId);
    els.screens.game.classList.remove('active');
    els.screens.result.classList.add('active');
    els.ui.resultScore.textContent = state.score;
    sprites.head.visible = false; sprites.body.visible = false; sprites.bottom.visible = false;
    if(els.baseCucumber) els.baseCucumber.style.opacity = 1;

    const isWin = state.score >= CONFIG.WIN_SCORE;
    if (sprites.win.el) sprites.win.el.style.display = 'none';
    if (sprites.lose.el) sprites.lose.el.style.display = 'none';
    
    if (isWin) {
        if (audio.win) audio.win.play().catch(()=>{});
        if (sprites.win.el) sprites.win.el.style.display = 'block';
        sprites.win.visible = true;
        els.ui.resultTitle.textContent = "ПОБЕДА!";
        els.ui.resultTitle.className = "win-text";
        els.ui.resultMsg.textContent = "Уровень пройден!";
        if(els.ui.btnNext) els.ui.btnNext.classList.remove('hidden');
        if(els.ui.btnRetry) els.ui.btnRetry.classList.add('hidden');
    } else {
        if (audio.lose) audio.lose.play().catch(()=>{});
        if (sprites.lose.el) sprites.lose.el.style.display = 'block';
        sprites.lose.visible = true;
        els.ui.resultTitle.textContent = "ПОРАЖЕНИЕ";
        els.ui.resultTitle.className = "lose-text";
        els.ui.resultMsg.textContent = "Не хватило очков...";
        if(els.ui.btnNext) els.ui.btnNext.classList.add('hidden');
        if(els.ui.btnRetry) els.ui.btnRetry.classList.remove('hidden');
    }

    const resultLoop = () => {
        if (!state.isPlaying && els.screens.result.classList.contains('active')) {
            renderSprites(); 
            requestAnimationFrame(resultLoop);
        }
    };
    resultLoop();
}