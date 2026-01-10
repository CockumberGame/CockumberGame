/* ==================================================================
   COCKUMBER RUBBER - FINAL CORE v3.0 (Sound & Sprites Fix)
   ================================================================== */

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// === 1. НАСТРОЙКИ (CONFIG) ===
const CONFIG = {
    REF_WIDTH: 360,
    REF_HEIGHT: 640,
    LEVEL_TIME: 60,
    WIN_SCORE: 2000,
    
    // БАЛАНС ОЧКОВ (УРЕЗАНО)
    SCORE: {
        HEAD_SPIN: 2,     // Было 3
        BODY_RUB: 1,      // Было 2
        TAP: 3,           // Было 5
        PENALTY_BASE: 10, // Сильнее штраф
        MAX_COMBO: 1.5    // Меньше множитель
    },

    // НАСТРОЙКИ СПРАЙТОВ (ВАЖНО: ВПИШИ СВОИ ЦИФРЫ!)
    // Сколько кадров по горизонтали в каждом файле?
    FRAMES: {
        head: 5,    // Пример: 4 кадра в anim_head.png
        body: 9,    // Пример: 8 кадров в anim_body.png
        bottom: 2,  // Пример: 5 кадров в anim_bottom.png
        win: 10,
        lose: 6
    },

    ANIM_SPEED: 0.4, // Скорость анимации (0.0 - 1.0)
    
    // Пороги срабатывания (чтобы не спамить очками)
    THRESHOLDS: {
        HEAD: 0.8, // Радиан (почти 45 градусов) для начисления
        BODY: 40   // Пикселей для начисления
    },

    PHASE_MIN_TIME: 3000,
    PHASE_MAX_TIME: 6000,
    PAUSE_TIME: 1000
};

const PHASES = { HEAD: 'head', BODY: 'body', TAP: 'tap', WAIT: 'wait' };

// === 2. STATE & AUDIO SYSTEM ===
let state = {
    isPlaying: false,
    score: 0,
    timeRemaining: CONFIG.LEVEL_TIME,
    currentPhase: PHASES.WAIT,
    phaseEndTime: 0,
    penaltyMultiplier: 1,
    combo: 1.0
};

// Аудио пул
const audio = {
    head: [],
    body: [],
    tap: [],
    win: null,
    lose: null,
    activeSource: null // Текущий проигрываемый звук
};

// Спрайты
let sprites = {
    head:   { frame: 0, dir: 1, active: false, el: null, frames: CONFIG.FRAMES.head },
    body:   { frame: 0, dir: 1, active: false, el: null, frames: CONFIG.FRAMES.body },
    bottom: { frame: 0, dir: 1, active: false, el: null, frames: CONFIG.FRAMES.bottom },
    win:    { frame: 0, dir: 1, active: false, el: null, frames: CONFIG.FRAMES.win },
    lose:   { frame: 0, dir: 1, active: false, el: null, frames: CONFIG.FRAMES.lose }
};

// DOM Elements
const els = {
    container: document.getElementById('game-container'),
    baseCucumber: document.getElementById('cucumber-base'), // Базовая картинка
    screens: {
        menu: document.getElementById('screen-menu'),
        game: document.getElementById('screen-game'),
        result: document.getElementById('screen-result')
    },
    ui: {
        timerDigits: document.getElementById('timer-digits'),
        progressFill: document.getElementById('progress-fill'),
        scoreText: document.getElementById('score-text'),
        phaseBarFill: document.getElementById('phase-timer-fill'),
        phaseBarContainer: document.getElementById('phase-timer-container'),
        resultScore: document.getElementById('result-score-val'),
        resultTitle: document.getElementById('result-title'),
        resultMsg: document.getElementById('result-message')
    },
    zones: {
        head: document.getElementById('zone-head'),
        body: document.getElementById('zone-body'),
        tapLeft: document.getElementById('zone-tap-left'),
        tapRight: document.getElementById('zone-tap-right')
    },
    icons: {
        head: document.getElementById('icon-head'),
        body: document.getElementById('icon-body'),
        tap1: document.getElementById('icon-tap-1'),
        tap2: document.getElementById('icon-tap-2')
    },
    particles: document.getElementById('particles-container')
};

// --- 3. INIT & ASSETS ---

// Загрузка звуков
function initAudio() {
    const load = (path) => {
        const a = new Audio(path);
        a.volume = 0.8;
        return a;
    };

    // Загружаем по 3 вариации
    for(let i=1; i<=3; i++) {
        audio.head.push(load(`assets/sfx_head_${i}.mp3`));
        audio.body.push(load(`assets/sfx_body_${i}.mp3`));
        audio.tap.push(load(`assets/sfx_tap_${i}.mp3`));
    }
    audio.win = load('assets/sfx_win.mp3');
    audio.lose = load('assets/sfx_lose.mp3');
}

// Инициализация спрайтов (CSS фиксы)
function initSprites() {
    const world = document.getElementById('world-layer');
    
    const createAnimEl = (id, imgName, frameCount) => {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'anim-sprite';
            world.appendChild(el);
        }
        el.style.backgroundImage = `url('assets/${imgName}')`;
        // FIX: Ширина фона = кол-во кадров * 100%. Высота 100%.
        el.style.backgroundSize = `${frameCount * 100}% 100%`;
        el.style.backgroundPosition = `0% 0%`; // Старт
        return el;
    };

    sprites.head.el = createAnimEl('anim-head', 'anim_head.png', sprites.head.frames);
    sprites.body.el = createAnimEl('anim-body', 'anim_body.png', sprites.body.frames);
    sprites.bottom.el = createAnimEl('anim-bottom', 'anim_bottom.png', sprites.bottom.frames);
    
    // Result screens
    const resContent = document.querySelector('.result-content');
    const oldWin = document.getElementById('anim-win');
    if(oldWin) oldWin.remove();
    
    sprites.win.el = document.createElement('div');
    sprites.win.el.id = 'anim-win';
    sprites.win.el.className = 'anim-sprite';
    sprites.win.el.style.position = 'relative'; 
    sprites.win.el.style.width = '200px'; 
    sprites.win.el.style.height = '200px'; 
    sprites.win.el.style.backgroundImage = `url('assets/anim_win.png')`;
    sprites.win.el.style.backgroundSize = `${sprites.win.frames * 100}% 100%`;
    sprites.win.el.style.display = 'none';
    resContent.insertBefore(sprites.win.el, els.ui.resultScore.parentNode);

    sprites.lose.el = sprites.win.el.cloneNode(true);
    sprites.lose.el.id = 'anim-lose';
    sprites.lose.el.style.backgroundImage = `url('assets/anim_lose.png')`;
    sprites.lose.el.style.backgroundSize = `${sprites.lose.frames * 100}% 100%`;
    resContent.insertBefore(sprites.lose.el, els.ui.resultScore.parentNode);
}

function resizeGame() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const scale = Math.min(winW / CONFIG.REF_WIDTH, winH / CONFIG.REF_HEIGHT);
    els.container.style.transform = `scale(${scale})`;
    els.container.style.transformOrigin = 'center center';
}

window.addEventListener('resize', resizeGame);
resizeGame();

// --- 4. GAME LOOP ---

document.getElementById('btn-start').onclick = startGame;
document.getElementById('btn-retry').onclick = startGame;

function startGame() {
    initAudio(); // Инит звука по клику (требование браузеров)
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
    
    Object.values(els.icons).forEach(icon => icon.classList.add('hidden'));
    
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
    else els.ui.timerDigits.className = 'pixel-text timer-normal';

    if (state.timeRemaining <= 0) finishGame();
}

function gameLoop() {
    if (!state.isPlaying) return;

    const now = Date.now();

    updateSprites(); // Анимация

    // Фазы
    if (now >= state.phaseEndTime) {
        if (state.currentPhase === PHASES.WAIT) {
            pickNewPhase();
        } else {
            enterWaitPhase();
        }
    }

    // UI Бара фазы
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

// --- 5. SPRITE ENGINE (PING-PONG) ---
function updateSprites() {
    let anyActive = false;

    Object.keys(sprites).forEach(key => {
        const s = sprites[key];
        const totalFrames = s.frames;

        if (!s.active && !s.forcePlay) {
            s.frame = 0;
            s.el.style.opacity = 0;
            return;
        }

        anyActive = true;
        s.el.style.opacity = 1;

        // Скорость обновления
        if (Math.random() < CONFIG.ANIM_SPEED) {
            s.frame += s.dir;
            if (s.frame >= totalFrames - 1) {
                s.frame = totalFrames - 1;
                s.dir = -1;
            } else if (s.frame <= 0) {
                s.frame = 0;
                s.dir = 1;
            }
        }
        
        // Математика позиции фона:
        // Если 5 кадров (0,1,2,3,4), то шаги: 0%, 25%, 50%, 75%, 100%
        if (totalFrames > 1) {
            const step = 100 / (totalFrames - 1);
            const pos = step * s.frame;
            s.el.style.backgroundPosition = `${pos}% 0%`;
        }
    });

    // ХИТРОСТЬ: Если играет анимация головы/тела/низа - скрываем базовый огурец
    // Это убирает эффект "двойного огурца"
    if (sprites.head.active || sprites.body.active || sprites.bottom.active) {
        els.baseCucumber.style.opacity = 0;
    } else {
        els.baseCucumber.style.opacity = 1;
    }
}

function enterWaitPhase() {
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + CONFIG.PAUSE_TIME;
    Object.values(els.icons).forEach(icon => icon.classList.add('hidden'));
    
    sprites.head.active = false;
    sprites.body.active = false;
    sprites.bottom.active = false;
}

function pickNewPhase() {
    const phases = [PHASES.HEAD, PHASES.BODY, PHASES.TAP];
    let next = phases[Math.floor(Math.random() * phases.length)];
    
    // Меньше шанс повтора
    if (next === state.lastPhase && Math.random() > 0.4) {
         next = phases.find(p => p !== state.lastPhase);
    }
    state.lastPhase = next;
    state.currentPhase = next;

    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    tg.HapticFeedback.notificationOccurred('success');
    
    if (next === PHASES.HEAD) els.icons.head.classList.remove('hidden');
    if (next === PHASES.BODY) els.icons.body.classList.remove('hidden');
    if (next === PHASES.TAP) {
        els.icons.tap1.classList.remove('hidden');
        els.icons.tap2.classList.remove('hidden');
    }
}

// --- 6. AUDIO LOGIC ---
function playZoneSound(type) {
    if (!CONFIG.SCORE) return; // check init
    
    // Получаем массив звуков для зоны
    let pool = audio[type];
    if (!pool || pool.length === 0) return;

    // Проверяем, играет ли уже какой-то звук из этого пула
    const isPlaying = pool.some(snd => !snd.paused);
    
    if (isPlaying) {
        // Если играет - не прерываем, пусть доиграет (Noise Reduction)
        return;
    }

    // Выбираем случайный
    const snd = pool[Math.floor(Math.random() * pool.length)];
    
    // Сброс и плей
    snd.currentTime = 0;
    snd.play().catch(e => console.log('Audio play error', e));
}


// --- 7. INPUT HANDLING ---

// Global Listeners
els.zones.head.addEventListener('touchmove', (e) => handleInput(e, PHASES.HEAD));
els.zones.body.addEventListener('touchmove', (e) => handleInput(e, PHASES.BODY));
els.zones.tapLeft.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
els.zones.tapRight.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
// Penalty listeners
els.zones.head.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.HEAD));
els.zones.body.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.BODY));

window.addEventListener('touchend', () => {
    gestureData.headAngle = null;
    gestureData.bodyLastY = null;
    sprites.head.active = false;
    sprites.body.active = false;
    sprites.bottom.active = false;
});

let gestureData = {
    headAngle: null,
    headAccumulator: 0,
    bodyLastY: null,
    bodyAccumulator: 0
};

function handleInput(e, zoneName) {
    if (!state.isPlaying || state.currentPhase === PHASES.WAIT) return;
    
    const touch = e.touches[0];
    
    if (state.currentPhase !== zoneName) {
        applyPenalty(touch, 1);
        return;
    }

    switch (zoneName) {
        case PHASES.HEAD: processHead(touch, e.currentTarget); break;
        case PHASES.BODY: processBody(touch); break;
        case PHASES.TAP: processTap(touch); break;
    }
}

function processHead(touch, target) {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
    
    if (gestureData.headAngle !== null) {
        let delta = Math.abs(angle - gestureData.headAngle);
        if (delta > Math.PI) delta = 2 * Math.PI - delta; 
        
        gestureData.headAccumulator += delta;
        
        // THRESHOLD: Начисляем очки только если набрали 0.8 радиана
        if (gestureData.headAccumulator > CONFIG.THRESHOLDS.HEAD) {
            triggerSuccess(PHASES.HEAD, touch.clientX, touch.clientY);
            gestureData.headAccumulator = 0;
            sprites.head.active = true; 
        }
    }
    gestureData.headAngle = angle;
}

function processBody(touch) {
    const y = touch.clientY;
    if (gestureData.bodyLastY !== null) {
        const delta = Math.abs(y - gestureData.bodyLastY);
        gestureData.bodyAccumulator += delta;
        
        // THRESHOLD: 40px свайпа для очка
        if (gestureData.bodyAccumulator > CONFIG.THRESHOLDS.BODY) {
            triggerSuccess(PHASES.BODY, touch.clientX, touch.clientY);
            gestureData.bodyAccumulator = 0;
            sprites.body.active = true;
        }
    }
    gestureData.bodyLastY = y;
}

function processTap(touch) {
    triggerSuccess(PHASES.TAP, touch.clientX, touch.clientY);
    sprites.bottom.active = true;
    setTimeout(() => { sprites.bottom.active = false; }, 200);
}

function checkPenaltyTap(e, zoneName) {
    if (state.currentPhase !== zoneName && state.currentPhase !== PHASES.WAIT) {
        applyPenalty(e.touches[0], 2);
    }
}

function applyPenalty(touch, severity) {
    state.penaltyMultiplier += 0.1;
    const penalty = Math.floor(CONFIG.SCORE.PENALTY_BASE * severity * state.penaltyMultiplier);
    
    // Штрафуем с вероятностью (чтобы не убить сразу)
    if (Math.random() > 0.7) { 
        state.score = Math.max(0, state.score - penalty);
        updateScoreUI();
        spawnFloatingText(`-${penalty}`, touch.clientX, touch.clientY, 'text-penalty');
        tg.HapticFeedback.notificationOccurred('error');
    }
}

function triggerSuccess(type, x, y) {
    let pts = 0;
    if (type === PHASES.HEAD) pts = CONFIG.SCORE.HEAD_SPIN;
    if (type === PHASES.BODY) pts = CONFIG.SCORE.BODY_RUB;
    if (type === PHASES.TAP) pts = CONFIG.SCORE.TAP;
    
    // Логика комбо
    state.combo = Math.min(state.combo + 0.05, CONFIG.SCORE.MAX_COMBO);
    
    // Финальные очки (округляем)
    const finalPts = Math.floor(pts * state.combo);
    state.score += finalPts;
    updateScoreUI();
    
    // 1. ЗВУК
    playZoneSound(type);

    // 2. ВИЗУАЛ (текст редко)
    if (Math.random() > 0.6) {
        spawnFloatingText(`+${finalPts}`, x, y, 'text-score');
    }
    
    // 3. ВИБРАЦИЯ (редко)
    if (Math.random() > 0.7) tg.HapticFeedback.impactOccurred('light');
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
    setTimeout(() => el.remove(), 800);
}

// --- 8. FINISH ---

function finishGame() {
    state.isPlaying = false;
    clearInterval(window.secTimerId);
    cancelAnimationFrame(window.loopId);
    
    els.screens.game.classList.remove('active');
    els.screens.result.classList.add('active');
    els.ui.resultScore.textContent = state.score;
    
    const isWin = state.score >= CONFIG.WIN_SCORE;
    
    sprites.win.el.style.display = 'none';
    sprites.lose.el.style.display = 'none';
    
    // Play final sound
    if (isWin) {
        if (audio.win) audio.win.play();
        sprites.win.el.style.display = 'block';
        sprites.win.active = true;
        sprites.win.forcePlay = true;
        els.ui.resultTitle.textContent = "ПОБЕДА!";
        els.ui.resultTitle.style.color = "#55ff55";
        els.ui.resultMsg.textContent = "Огурец доволен!";
    } else {
        if (audio.lose) audio.lose.play();
        sprites.lose.el.style.display = 'block';
        sprites.lose.active = true;
        sprites.lose.forcePlay = true;
        els.ui.resultTitle.textContent = "ФИАСКО";
        els.ui.resultTitle.style.color = "#ff5555";
        els.ui.resultMsg.textContent = "Нужно больше стараться...";
    }

    // Result screen loop
    const resul