window.onerror = function(msg, url, line) {
   // Выводим ошибки на экран, чтобы ты видел их на телефоне
   alert("Error: " + msg + "\nLine: " + line);
   return false;
};

/* ==================================================================
   COCKUMBER RUBBER - FINAL CORE v3.1 (Fixed & Safe)
   ================================================================== */

// Безопасная инициализация Telegram (чтобы работало и в браузере для тестов)
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : {
    ready: () => {},
    expand: () => {},
    HapticFeedback: {
        notificationOccurred: () => {},
        impactOccurred: () => {}
    }
};
tg.ready();
tg.expand();

// === 1. НАСТРОЙКИ (CONFIG) ===
const CONFIG = {
    REF_WIDTH: 360,
    REF_HEIGHT: 640,
    LEVEL_TIME: 60,
    WIN_SCORE: 2000,
    
    // БАЛАНС ОЧКОВ
    SCORE: {
        HEAD_SPIN: 2,
        BODY_RUB: 1,
        TAP: 3,
        PENALTY_BASE: 10,
        MAX_COMBO: 1.5
    },

    // НАСТРОЙКИ СПРАЙТОВ (Твои цифры)
    FRAMES: {
        head: 5,
        body: 9,
        bottom: 2,
        win: 10,
        lose: 6
    },

    ANIM_SPEED: 0.4,
    
    THRESHOLDS: {
        HEAD: 0.8,
        BODY: 40
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
    lose: null
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
// Используем try-catch на случай, если HTML не прогрузился, но скрипт запущен
const getEl = (id) => document.getElementById(id);

const els = {
    container: getEl('game-container'),
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
        resultMsg: getEl('result-message')
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

// --- 3. INIT & ASSETS ---

function initAudio() {
    const load = (path) => {
        // Создаем аудио объект, ошибки загрузки игнорируем (чтобы не крашилось)
        const a = new Audio(path);
        a.volume = 0.8;
        a.onerror = () => console.log("Audio missing: " + path); 
        return a;
    };

    // Очищаем массивы перед загрузкой (на всякий случай)
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
        el.style.backgroundImage = `url('assets/${imgName}')`;
        el.style.backgroundSize = `${frameCount * 100}% 100%`;
        el.style.backgroundPosition = `0% 0%`;
        return el;
    };

    sprites.head.el = createAnimEl('anim-head', 'anim_head.png', sprites.head.frames);
    sprites.body.el = createAnimEl('anim-body', 'anim_body.png', sprites.body.frames);
    sprites.bottom.el = createAnimEl('anim-bottom', 'anim_bottom.png', sprites.bottom.frames);
    
    // Result screens
    const resContent = document.querySelector('.result-content');
    if (resContent) {
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

// --- 4. GAME LOOP ---

// Проверка на существование кнопки перед навешиванием события
if (document.getElementById('btn-start')) {
    document.getElementById('btn-start').onclick = startGame;
}
if (document.getElementById('btn-retry')) {
    document.getElementById('btn-retry').onclick = startGame;
}

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
    
    Object.values(els.icons).forEach(icon => {
        if(icon) icon.classList.add('hidden');
    });
    
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

    updateSprites();

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

// --- 5. SPRITE ENGINE ---
function updateSprites() {
    Object.keys(sprites).forEach(key => {
        const s = sprites[key];
        const totalFrames = s.frames;

        if (!s.el) return;

        if (!s.active && !s.forcePlay) {
            s.frame = 0;
            s.el.style.opacity = 0;
            return;
        }

        s.el.style.opacity = 1;

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
        
        if (totalFrames > 1) {
            const step = 100 / (totalFrames - 1);
            const pos = step * s.frame;
            s.el.style.backgroundPosition = `${pos}% 0%`;
        }
    });

    if (sprites.head.active || sprites.body.active || sprites.bottom.active) {
        if(els.baseCucumber) els.baseCucumber.style.opacity = 0;
    } else {
        if(els.baseCucumber) els.baseCucumber.style.opacity = 1;
    }
}

function enterWaitPhase() {
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + CONFIG.PAUSE_TIME;
    Object.values(els.icons).forEach(icon => {
        if(icon) icon.classList.add('hidden');
    });
    
    sprites.head.active = false;
    sprites.body.active = false;
    sprites.bottom.active = false;
}

function pickNewPhase() {
    const phases = [PHASES.HEAD, PHASES.BODY, PHASES.TAP];
    let next = phases[Math.floor(Math.random() * phases.length)];
    
    if (next === state.lastPhase && Math.random() > 0.4) {
         next = phases.find(p => p !== state.lastPhase);
    }
    state.lastPhase = next;
    state.currentPhase = next;

    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    tg.HapticFeedback.notificationOccurred('success');
    
    if (next === PHASES.HEAD && els.icons.head) els.icons.head.classList.remove('hidden');
    if (next === PHASES.BODY && els.icons.body) els.icons.body.classList.remove('hidden');
    if (next === PHASES.TAP) {
        if(els.icons.tap1) els.icons.tap1.classList.remove('hidden');
        if(els.icons.tap2) els.icons.tap2.classList.remove('hidden');
    }
}

// --- 6. AUDIO LOGIC ---
function playZoneSound(type) {
    let pool = audio[type];
    if (!pool || pool.length === 0) return;

    const isPlaying = pool.some(snd => !snd.paused);
    if (isPlaying) return;

    const snd = pool[Math.floor(Math.random() * pool.length)];
    snd.currentTime = 0;
    
    // Оборачиваем в промис, чтобы избежать ошибок если автоплей запрещен
    const playPromise = snd.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            // console.log("Audio play prevented");
        });
    }
}

// --- 7. INPUT HANDLING ---

// Запрещаем скролл
document.addEventListener('touchmove', function(e) { 
    if(e.target.closest('#game-container')) {
        e.preventDefault(); 
    }
}, { passive: false });

if(els.zones.head) els.zones.head.addEventListener('touchmove', (e) => handleInput(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchmove', (e) => handleInput(e, PHASES.BODY));
if(els.zones.tapLeft) els.zones.tapLeft.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
if(els.zones.tapRight) els.zones.tapRight.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));

if(els.zones.head) els.zones.head.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.HEAD));
if(els.zones.body) els.zones.body.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.BODY));

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
    
    state.combo = Math.min(state.combo + 0.05, CONFIG.SCORE.MAX_COMBO);
    
    const finalPts = Math.floor(pts * state.combo);
    state.score += finalPts;
    updateScoreUI();
    
    playZoneSound(type);

    if (Math.random() > 0.6) {
        spawnFloatingText(`+${finalPts}`, x, y, 'text-score');
    }
    
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
    
    if (sprites.win.el) sprites.win.el.style.display = 'none';
    if (sprites.lose.el) sprites.lose.el.style.display = 'none';
    
    if (isWin) {
        if (audio.win) audio.win.play().catch(()=>{});
        if (sprites.win.el) sprites.win.el.style.display = 'block';
        sprites.win.active = true;
        sprites.win.forcePlay = true;
        els.ui.resultTitle.textContent = "ПОБЕДА!";
        els.ui.resultTitle.style.color = "#55ff55";
        els.ui.resultMsg.textContent = "Огурец доволен!";
    } else {
        if (audio.lose) audio.lose.play().catch(()=>{});
        if (sprites.lose.el) sprites.lose.el.style.display = 'block';
        sprites.lose.active = true;
        sprites.lose.forcePlay = true;
        els.ui.resultTitle.textContent = "ФИАСКО";
        els.ui.resultTitle.style.color = "#ff5555";
        els.ui.resultMsg.textContent = "Нужно больше стараться...";
    }

    // ВОТ ЗДЕСЬ РАНЬШЕ БЫЛ ОБРЫВ. ТЕПЕРЬ ИСПРАВЛЕНО:
    const resultLoop = () => {
        if (!state.isPlaying && els.screens.result.classList.contains('active')) {
            updateSprites();
            requestAnimationFrame(resultLoop);
        }
    };
    resultLoop();
}