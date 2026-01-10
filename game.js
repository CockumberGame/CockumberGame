/* ==================================================================
   COCKUMBER RUBBER - v2.0 (Sprite Sheet & Balance Fix)
   ================================================================== */

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// === CONFIGURATION ===
const CONFIG = {
    REF_WIDTH: 360,
    REF_HEIGHT: 640,
    LEVEL_TIME: 60,
    WIN_SCORE: 2000,
    
    // НАСТРОЙКИ БАЛАНСА
    SCORE: {
        HEAD_SPIN: 3,    // Очков за действие
        BODY_RUB: 2,     
        TAP: 5,          
        PENALTY_BASE: 5,
        MAX_COMBO: 2.0   // Макс множитель (не 3.0, чтобы не улетало)
    },

    // НАСТРОЙКИ СПРАЙТОВ (ВАЖНО!)
    // Сколько кадров в твоих полосках? Я ставлю 5. Если их 8 - поставь 8.
    FRAMES_COUNT: 5, 
    ANIM_SPEED: 0.5, // Скорость анимации (0.0 - 1.0)

    // ТАЙМИНГИ
    PHASE_MIN_TIME: 3000,
    PHASE_MAX_TIME: 6000,
    PAUSE_TIME: 1000 // Пауза между фазами (сек)
};

const PHASES = {
    HEAD: 'head',
    BODY: 'body',
    TAP: 'tap',
    WAIT: 'wait' // Фаза ожидания
};

// === STATE ===
let state = {
    isPlaying: false,
    score: 0,
    timeRemaining: CONFIG.LEVEL_TIME,
    currentPhase: PHASES.WAIT,
    phaseEndTime: 0,
    penaltyMultiplier: 1,
    combo: 1.0,
    lastActionTime: 0,
};

// Менеджер анимаций (хранит текущий кадр для каждого спрайта)
let sprites = {
    head: { frame: 0, dir: 1, active: false, el: null },
    body: { frame: 0, dir: 1, active: false, el: null },
    bottom: { frame: 0, dir: 1, active: false, el: null },
    win: { frame: 0, dir: 1, active: false, el: null },   // Новое
    lose: { frame: 0, dir: 1, active: false, el: null }   // Новое
};

// Таймеры
let loopId = null;
let secTimerId = null;

// DOM Elements Cache
const els = {
    container: document.getElementById('game-container'),
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
        tapLeft: document.getElementById('zone-tap-left'), // Новая ID
        tapRight: document.getElementById('zone-tap-right') // Новая ID
    },
    icons: {
        head: document.getElementById('icon-head'),
        body: document.getElementById('icon-body'),
        tap1: document.getElementById('icon-tap-1'),
        tap2: document.getElementById('icon-tap-2')
    },
    particles: document.getElementById('particles-container')
};

// --- 1. SETUP & RESIZE ---

// Инициализация спрайтов (создаем div элементы динамически или берем существующие)
function initSprites() {
    // Удаляем старые, если были
    const world = document.getElementById('world-layer');
    
    // Создаем структуру спрайтов
    const createAnimEl = (id, imgName) => {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'anim-sprite';
            world.appendChild(el);
        }
        // Задаем картинку через CSS
        el.style.backgroundImage = `url('assets/${imgName}')`;
        // Размер фона = (Кол-во кадров * 100)%
        el.style.backgroundSize = `${CONFIG.FRAMES_COUNT * 100}% 100%`;
        return el;
    };

    sprites.head.el = createAnimEl('anim-head', 'anim_head.png');
    sprites.body.el = createAnimEl('anim-body', 'anim_body.png');
    sprites.bottom.el = createAnimEl('anim-bottom', 'anim_bottom.png');
    
    // Спрайты победы/поражения добавляем в result экран
    const resContent = document.querySelector('.result-content');
    // Удалим, если уже есть
    const oldWin = document.getElementById('anim-win');
    if(oldWin) oldWin.remove();
    
    sprites.win.el = document.createElement('div');
    sprites.win.el.className = 'anim-sprite';
    sprites.win.el.style.position = 'relative'; // В потоке
    sprites.win.el.style.width = '200px'; 
    sprites.win.el.style.height = '200px'; 
    sprites.win.el.style.backgroundImage = `url('assets/anim_win.png')`;
    sprites.win.el.style.backgroundSize = `${CONFIG.FRAMES_COUNT * 100}% 100%`;
    sprites.win.el.style.display = 'none';
    resContent.insertBefore(sprites.win.el, els.ui.resultScore.parentNode);

    sprites.lose.el = sprites.win.el.cloneNode(true);
    sprites.lose.el.style.backgroundImage = `url('assets/anim_lose.png')`;
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

// --- 2. GAME LOOP ---

document.getElementById('btn-start').onclick = startGame;
document.getElementById('btn-retry').onclick = startGame;

function startGame() {
    initSprites(); // Подгружаем спрайты
    
    state.score = 0;
    state.timeRemaining = CONFIG.LEVEL_TIME;
    state.combo = 1.0;
    state.penaltyMultiplier = 1;
    state.isPlaying = true;
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + 1000; // Старт через 1 сек

    els.screens.menu.classList.remove('active');
    els.screens.result.classList.remove('active');
    els.screens.game.classList.add('active');
    els.ui.timerDigits.className = 'pixel-text timer-normal';
    
    // Скрываем иконки
    Object.values(els.icons).forEach(icon => icon.classList.add('hidden'));
    
    updateScoreUI();
    
    if (loopId) cancelAnimationFrame(loopId);
    if (secTimerId) clearInterval(secTimerId);
    
    secTimerId = setInterval(onSecondTick, 1000);
    gameLoop();
}

function onSecondTick() {
    if (!state.isPlaying) return;
    state.timeRemaining--;
    
    els.ui.timerDigits.textContent = state.timeRemaining;
    if (state.timeRemaining <= 10) els.ui.timerDigits.className = 'pixel-text timer-crit';
    else if (state.timeRemaining <= 20) els.ui.timerDigits.className = 'pixel-text timer-orange';
    else if (state.timeRemaining <= 30) els.ui.timerDigits.className = 'pixel-text timer-warn';

    if (state.timeRemaining <= 0) finishGame();
}

function gameLoop() {
    if (!state.isPlaying) return;

    const now = Date.now();

    // 1. Анимация Спрайтов (Ping-Pong)
    updateSprites();

    // 2. Фазы
    if (now >= state.phaseEndTime) {
        if (state.currentPhase === PHASES.WAIT) {
            pickNewPhase();
        } else {
            // Фаза закончилась -> Пауза
            enterWaitPhase();
        }
    }

    // 3. UI Бара фазы
    if (state.currentPhase !== PHASES.WAIT) {
        const timeLeft = state.phaseEndTime - now;
        const totalTime = state.phaseTotalTime;
        const pct = Math.max(0, (timeLeft / totalTime) * 100);
        els.ui.phaseBarFill.style.width = `${pct}%`;
    } else {
        els.ui.phaseBarFill.style.width = '0%';
    }

    loopId = requestAnimationFrame(gameLoop);
}

// Апдейт кадров спрайтов
function updateSprites() {
    Object.keys(sprites).forEach(key => {
        const s = sprites[key];
        if (!s.active && !s.forcePlay) {
            // Если не активен - сброс в 0 (или можно оставить плавное затухание)
            if (s.frame > 0) s.frame = 0; 
            s.el.style.opacity = 0;
            return;
        }

        s.el.style.opacity = 1;
        
        // Логика "Пинг-Понг" анимации (0->1->2->3->4->3->2->1...)
        // Скорость зависит от CONFIG.ANIM_SPEED (пропускаем кадры рендера)
        if (Math.random() < CONFIG.ANIM_SPEED) {
            s.frame += s.dir;
            if (s.frame >= CONFIG.FRAMES_COUNT - 1) {
                s.frame = CONFIG.FRAMES_COUNT - 1;
                s.dir = -1; // Назад
            } else if (s.frame <= 0) {
                s.frame = 0;
                s.dir = 1; // Вперед
            }
        }
        
        // Сдвигаем background-position
        // Формула: (100 / (Frames - 1)) * FrameIndex
        const pos = (100 / (CONFIG.FRAMES_COUNT - 1)) * s.frame;
        s.el.style.backgroundPosition = `${pos}% 0%`;
    });
}

function enterWaitPhase() {
    state.currentPhase = PHASES.WAIT;
    state.phaseEndTime = Date.now() + CONFIG.PAUSE_TIME;
    
    // Скрываем все иконки
    Object.values(els.icons).forEach(icon => icon.classList.add('hidden'));
    
    // Останавливаем анимации
    sprites.head.active = false;
    sprites.body.active = false;
    sprites.bottom.active = false;
}

function pickNewPhase() {
    const phases = [PHASES.HEAD, PHASES.BODY, PHASES.TAP];
    let next = phases[Math.floor(Math.random() * phases.length)];
    
    state.currentPhase = next;
    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    // Визуал
    tg.HapticFeedback.notificationOccurred('success');
    
    if (next === PHASES.HEAD) els.icons.head.classList.remove('hidden');
    if (next === PHASES.BODY) els.icons.body.classList.remove('hidden');
    if (next === PHASES.TAP) {
        els.icons.tap1.classList.remove('hidden');
        els.icons.tap2.classList.remove('hidden');
    }
}

// --- 3. INPUT HANDLING ---

// Запрет дефолтных свайпов
document.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });

// Обработчики
els.zones.head.addEventListener('touchmove', (e) => handleInput(e, PHASES.HEAD));
els.zones.body.addEventListener('touchmove', (e) => handleInput(e, PHASES.BODY));

// Тапы (Left + Right)
els.zones.tapLeft.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
els.zones.tapRight.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));

// Штрафы (случайные нажатия не туда)
els.zones.head.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.HEAD));
els.zones.body.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.BODY));


let gestureData = {
    headAngle: null,
    headAccumulator: 0,
    bodyLastY: null,
    bodyAccumulator: 0
};

window.addEventListener('touchend', () => {
    gestureData.headAngle = null;
    gestureData.bodyLastY = null;
    // Остановка анимации при отпускании
    sprites.head.active = false;
    sprites.body.active = false;
    sprites.bottom.active = false;
});

function handleInput(e, zoneName) {
    if (!state.isPlaying || state.currentPhase === PHASES.WAIT) return;
    
    const touch = e.touches[0];
    
    // ПРОВЕРКА ФАЗЫ
    if (state.currentPhase !== zoneName) {
        applyPenalty(touch, 1);
        return;
    }

    // ЛОГИКА
    switch (zoneName) {
        case PHASES.HEAD:
            processHead(touch, e.currentTarget);
            break;
        case PHASES.BODY:
            processBody(touch);
            break;
        case PHASES.TAP:
            processTap(touch);
            break;
    }
}

function processHead(touch, target) {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
    
    if (gestureData.headAngle !== null) {
        let delta = Math.abs(angle - gestureData.headAngle);
        if (delta > Math.PI) delta = 2 * Math.PI - delta; // Коррекция перехода 360
        
        gestureData.headAccumulator += delta;
        
        // Порог: ~0.5 радиана (около 30 градусов) для зачета
        if (gestureData.headAccumulator > 0.5) {
            triggerSuccess(PHASES.HEAD, touch.clientX, touch.clientY);
            gestureData.headAccumulator = 0;
            sprites.head.active = true; // Включаем анимацию
        }
    }
    gestureData.headAngle = angle;
}

function processBody(touch) {
    const y = touch.clientY;
    if (gestureData.bodyLastY !== null) {
        const delta = Math.abs(y - gestureData.bodyLastY);
        gestureData.bodyAccumulator += delta;
        
        // Порог: 20px свайпа
        if (gestureData.bodyAccumulator > 20) {
            triggerSuccess(PHASES.BODY, touch.clientX, touch.clientY);
            gestureData.bodyAccumulator = 0;
            sprites.body.active = true;
        }
    }
    gestureData.bodyLastY = y;
}

function processTap(touch) {
    triggerSuccess(PHASES.TAP, touch.clientX, touch.clientY);
    
    // Для тапа анимация короткая (forcePlay - кастомное свойство)
    sprites.bottom.active = true;
    setTimeout(() => { sprites.bottom.active = false; }, 200);
}

function checkPenaltyTap(e, zoneName) {
    if (state.currentPhase !== zoneName && state.currentPhase !== PHASES.WAIT) {
        applyPenalty(e.touches[0], 2); // Сильный штраф за тап не туда
    }
}

function applyPenalty(touch, severity) {
    state.penaltyMultiplier += 0.1;
    const penalty = Math.floor(CONFIG.SCORE.PENALTY_BASE * severity * state.penaltyMultiplier);
    
    if (Math.random() > 0.8) { // Не спамим штрафами
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
    state.score += Math.floor(pts * state.combo);
    updateScoreUI();
    
    // Редко показываем текст, чтобы не засорять экран
    if (Math.random() > 0.7) {
        spawnFloatingText(`+${Math.floor(pts*state.combo)}`, x, y, 'text-score');
    }
    
    if (Math.random() > 0.8) tg.HapticFeedback.impactOccurred('light');
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

// --- 4. FINISH ---

function finishGame() {
    state.isPlaying = false;
    clearInterval(secTimerId);
    cancelAnimationFrame(loopId);
    
    els.screens.game.classList.remove('active');
    els.screens.result.classList.add('active');
    
    els.ui.resultScore.textContent = state.score;
    
    // Логика победы/поражения и спрайтов
    const isWin = state.score >= CONFIG.WIN_SCORE;
    
    sprites.win.el.style.display = 'none';
    sprites.lose.el.style.display = 'none';
    
    // Запускаем анимацию в попапе результата
    const finalSprite = isWin ? sprites.win : sprites.lose;
    finalSprite.el.style.display = 'block';
    finalSprite.active = true;
    finalSprite.forcePlay = true; // Играть постоянно
    
    // Запускаем отдельный луп для result screen
    const resultLoop = () => {
        if (!state.isPlaying && els.screens.result.classList.contains('active')) {
            updateSprites();
            requestAnimationFrame(resultLoop);
        }
    };
    resultLoop();

    if (isWin) {
        els.ui.resultTitle.textContent = "ПОБЕДА!";
        els.ui.resultTitle.style.color = "#55ff55";
        els.ui.resultMsg.textContent = "Огурец доволен!";
    } else {
        els.ui.resultTitle.textContent = "ФИАСКО";
        els.ui.resultTitle.style.color = "#ff5555";
        els.ui.resultMsg.textContent = "Нужно больше стараться...";
    }
}