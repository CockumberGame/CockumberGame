/* ==================================================================
   COCKUMBER RUBBER - CORE LOGIC
   ================================================================== */

// --- 1. CONFIG & SETUP ---
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
// Блокируем вертикальные свайпы (закрытие) на iOS
tg.enableClosingConfirmation(); 

const CONFIG = {
    REF_WIDTH: 360,
    REF_HEIGHT: 640,
    LEVEL_TIME: 60,       // Секунды
    WIN_SCORE: 2000,
    MARGIN_PERCENT: 0.08, // 8% зоны - это безопасный отступ (буфер)
    PHASE_MIN_TIME: 3000, // Мин время одной фазы (мс)
    PHASE_MAX_TIME: 6000, // Макс время одной фазы (мс)
    
    // Настройки очков
    SCORE: {
        HEAD_SPIN: 15,    // За оборот
        BODY_RUB: 12,     // За свайп
        TAP: 15,          // За тап
        PENALTY_BASE: 5   // Базовый штраф
    }
};

// Перечисления фаз
const PHASES = {
    HEAD: 'head',
    BODY: 'body',
    TAP: 'tap'
};

// Глобальное состояние
let state = {
    isPlaying: false,
    score: 0,
    timeRemaining: CONFIG.LEVEL_TIME,
    currentPhase: null,
    phaseEndTime: 0,      // Timestamp окончания текущей фазы
    penaltyMultiplier: 1, // Множитель штрафа (растет при ошибках)
    combo: 1.0,
    lastActionTime: 0,
};

// Таймеры
let loopId = null;     // requestAnimationFrame
let secTimerId = null; // setInterval (секунды)

// Кеш DOM элементов (чтобы не искать их каждый кадр)
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
        combo: document.getElementById('combo-display'),
        bestScore: document.getElementById('menu-best-score'),
        resultScore: document.getElementById('result-score-val'),
        resultTitle: document.getElementById('result-title'),
        resultMsg: document.getElementById('result-message')
    },
    zones: {
        head: document.getElementById('zone-head'),
        body: document.getElementById('zone-body'),
        tap: document.getElementById('zone-tap')
    },
    icons: {
        head: document.getElementById('icon-head'),
        body: document.getElementById('icon-body'),
        tap1: document.getElementById('icon-tap-1'),
        tap2: document.getElementById('icon-tap-2')
    },
    anims: {
        head: document.getElementById('anim-head'),
        body: document.getElementById('anim-body'),
        bottom: document.getElementById('anim-bottom')
    },
    particles: document.getElementById('particles-container')
};

// --- 2. RESIZE SYSTEM (SCALER) ---

function resizeGame() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    // Вычисляем масштаб, чтобы вписать 360x640 в экран
    const scale = Math.min(winW / CONFIG.REF_WIDTH, winH / CONFIG.REF_HEIGHT);
    
    els.container.style.transform = `scale(${scale})`;
    
    // Центрирование через margin (так как transform scale работает от центра)
    // Но в CSS у нас flex body, так что scale достаточно, если transform-origin верный.
    // Мы зададим origin в CSS, но здесь продублируем для надежности.
    els.container.style.transformOrigin = 'center center';
}

window.addEventListener('resize', resizeGame);
resizeGame(); // Первый вызов

// --- 3. GAME LOOP & PHASE MANAGER ---

document.getElementById('btn-start').onclick = startGame;
document.getElementById('btn-retry').onclick = startGame;

function startGame() {
    // Сброс состояния
    state.score = 0;
    state.timeRemaining = CONFIG.LEVEL_TIME;
    state.combo = 1.0;
    state.penaltyMultiplier = 1;
    state.isPlaying = true;

    // UI Сброс
    els.screens.menu.classList.remove('active');
    els.screens.result.classList.remove('active');
    els.screens.game.classList.add('active');
    els.ui.timerDigits.className = 'pixel-text timer-normal';
    
    updateScoreUI();
    pickNewPhase();
    
    // Запуск циклов
    if (loopId) cancelAnimationFrame(loopId);
    if (secTimerId) clearInterval(secTimerId);
    
    secTimerId = setInterval(onSecondTick, 1000);
    gameLoop();
}

function onSecondTick() {
    if (!state.isPlaying) return;
    
    state.timeRemaining--;
    
    // Обновление цифр и цвета
    const t = state.timeRemaining;
    els.ui.timerDigits.textContent = t;
    
    if (t <= 10) els.ui.timerDigits.className = 'pixel-text timer-crit';
    else if (t <= 20) els.ui.timerDigits.className = 'pixel-text timer-orange';
    else if (t <= 30) els.ui.timerDigits.className = 'pixel-text timer-warn';
    else els.ui.timerDigits.className = 'pixel-text timer-normal';

    if (state.timeRemaining <= 0) {
        finishGame();
    }
}

function gameLoop() {
    if (!state.isPlaying) return;

    const now = Date.now();

    // 1. Проверка фазы
    if (now >= state.phaseEndTime) {
        pickNewPhase();
    }

    // 2. Обновление бара фазы
    const timeLeft = state.phaseEndTime - now;
    const totalTime = state.phaseTotalTime;
    const pct = Math.max(0, (timeLeft / totalTime) * 100);
    els.ui.phaseBarFill.style.width = `${pct}%`;

    // 3. Сброс комбо, если долго не было действий (2 сек)
    if (now - state.lastActionTime > 2000 && state.combo > 1.0) {
        state.combo = 1.0;
        els.ui.combo.classList.add('hidden');
    }

    loopId = requestAnimationFrame(gameLoop);
}

function pickNewPhase() {
    // Выбираем новую фазу, отличную от текущей (желательно)
    const phases = [PHASES.HEAD, PHASES.BODY, PHASES.TAP];
    let next = phases[Math.floor(Math.random() * phases.length)];
    
    // 30% шанс повтора фазы, иначе меняем
    if (next === state.currentPhase && Math.random() > 0.3) {
        next = phases.find(p => p !== state.currentPhase);
    }
    
    state.currentPhase = next;
    
    // Время фазы (рандом)
    const duration = CONFIG.PHASE_MIN_TIME + Math.random() * (CONFIG.PHASE_MAX_TIME - CONFIG.PHASE_MIN_TIME);
    state.phaseTotalTime = duration;
    state.phaseEndTime = Date.now() + duration;

    // Визуализация смены фазы
    applyPhaseVisuals(next);
}

function applyPhaseVisuals(phase) {
    // Скрываем все иконки
    els.icons.head.classList.add('hidden');
    els.icons.body.classList.add('hidden');
    els.icons.tap1.classList.add('hidden');
    els.icons.tap2.classList.add('hidden');
    els.ui.phaseBarContainer.classList.remove('hidden');

    // Вибрация о смене
    tg.HapticFeedback.notificationOccurred('success');

    // Показываем нужные
    switch(phase) {
        case PHASES.HEAD:
            els.icons.head.classList.remove('hidden');
            break;
        case PHASES.BODY:
            els.icons.body.classList.remove('hidden');
            break;
        case PHASES.TAP:
            els.icons.tap1.classList.remove('hidden');
            els.icons.tap2.classList.remove('hidden');
            break;
    }
}

// --- 4. INPUT HANDLING & GESTURES ---

// Навешиваем слушатели
els.zones.head.addEventListener('touchmove', (e) => handleInput(e, PHASES.HEAD));
els.zones.body.addEventListener('touchmove', (e) => handleInput(e, PHASES.BODY));

// Для тапов используем touchstart
els.zones.tap.addEventListener('touchstart', (e) => handleInput(e, PHASES.TAP));
// Также отлавливаем случайные тапы в других зонах для штрафов
els.zones.head.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.HEAD));
els.zones.body.addEventListener('touchstart', (e) => checkPenaltyTap(e, PHASES.BODY));


// Вспомогательные переменные для жестов
let gestureData = {
    headAngle: null,
    headAccumulator: 0,
    bodyLastY: null,
    bodyAccumulator: 0
};

// Сброс при отпускании пальца
window.addEventListener('touchend', () => {
    gestureData.headAngle = null;
    gestureData.bodyLastY = null;
    // Сбрасываем множитель штрафа при отпускании, чтобы дать шанс исправиться
    state.penaltyMultiplier = 1;
});

function handleInput(e, zoneName) {
    if (!state.isPlaying) return;
    
    // Получаем координаты касания
    const touch = e.touches[0];
    const target = e.currentTarget; // Зона, по которой ведут пальцем

    // === ГЛАВНАЯ ПРОВЕРКА: Правильная ли зона? ===
    if (state.currentPhase !== zoneName) {
        // Игрок трогает зону zoneName, но сейчас активна state.currentPhase.
        // Нужно проверить Margin (отступ).
        // Если он с краю зоны - прощаем. Если глубоко - штрафуем.
        applyPenaltyLogic(touch, target);
        return;
    }

    // Если зона правильная - обрабатываем механику
    switch (zoneName) {
        case PHASES.HEAD:
            processHeadRotation(touch, target);
            break;
        case PHASES.BODY:
            processBodyRub(touch);
            break;
        case PHASES.TAP:
            // Для тапа просто засчитываем
            processTap(touch);
            break;
    }
}

// -- GESTURE: HEAD SPIN --
function processHeadRotation(touch, target) {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
    
    if (gestureData.headAngle !== null) {
        let delta = angle - gestureData.headAngle;
        // Нормализация перехода через -PI/PI
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        
        gestureData.headAccumulator += Math.abs(delta);
        
        // Порог: ~1/3 круга для срабатывания (чтобы было динамично)
        if (gestureData.headAccumulator > 2.0) {
            triggerSuccess(PHASES.HEAD, touch.clientX, touch.clientY);
            gestureData.headAccumulator = 0;
        }
    }
    gestureData.headAngle = angle;
}

// -- GESTURE: BODY RUB --
function processBodyRub(touch) {
    const y = touch.clientY;
    
    if (gestureData.bodyLastY !== null) {
        const delta = Math.abs(y - gestureData.bodyLastY);
        gestureData.bodyAccumulator += delta;
        
        // Порог: 40px движения (в координатах экрана)
        if (gestureData.bodyAccumulator > 40) {
            triggerSuccess(PHASES.BODY, touch.clientX, touch.clientY);
            gestureData.bodyAccumulator = 0;
        }
    }
    gestureData.bodyLastY = y;
}

// -- GESTURE: TAP --
function processTap(touch) {
    triggerSuccess(PHASES.TAP, touch.clientX, touch.clientY);
}

// -- PENALTY LOGIC --
function checkPenaltyTap(e, zoneName) {
    if (!state.isPlaying) return;
    if (state.currentPhase !== zoneName) {
        applyPenaltyLogic(e.touches[0], e.currentTarget);
    }
}

function applyPenaltyLogic(touch, targetZone) {
    const rect = targetZone.getBoundingClientRect();
    const h = rect.height;
    
    // Вычисляем относительную позицию касания внутри зоны (0.0 - 1.0)
    const relativeY = (touch.clientY - rect.top) / h;
    
    // Определяем, насколько глубоко зашли
    // Margin - это безопасная зона (например 8% с краев)
    const margin = CONFIG.MARGIN_PERCENT;
    
    // Если мы в безопасной зоне (сверху или снизу), выходим
    if (relativeY < margin || relativeY > (1 - margin)) {
        return; // Прощаем
    }
    
    // Иначе - ШТРАФ
    state.penaltyMultiplier += 0.2; // Растет с каждым тиком
    const penalty = Math.floor(CONFIG.SCORE.PENALTY_BASE * state.penaltyMultiplier);
    
    state.score -= penalty;
    state.combo = 1.0; // Сброс комбо
    els.ui.combo.classList.add('hidden');
    
    updateScoreUI();
    
    // Визуал штрафа (только иногда, чтобы не спамить DOM)
    if (Math.random() > 0.7) {
        spawnFloatingText(`-${penalty}`, touch.clientX, touch.clientY, 'text-penalty');
        tg.HapticFeedback.notificationOccurred('error');
    }
}


// --- 5. SUCCESS & EFFECTS ---

function triggerSuccess(type, x, y) {
    // 1. Очки
    let baseScore = 0;
    if (type === PHASES.HEAD) baseScore = CONFIG.SCORE.HEAD_SPIN;
    if (type === PHASES.BODY) baseScore = CONFIG.SCORE.BODY_RUB;
    if (type === PHASES.TAP) baseScore = CONFIG.SCORE.TAP;
    
    // Комбо
    state.combo = Math.min(state.combo + 0.1, 3.0);
    state.lastActionTime = Date.now();
    
    const finalScore = Math.floor(baseScore * state.combo);
    state.score += finalScore;
    updateScoreUI();
    
    // 2. Визуал текста
    spawnFloatingText(`+${finalScore}`, x, y, 'text-score');
    
    // 3. Анимация спрайта (вспышка)
    let animEl = null;
    if (type === PHASES.HEAD) animEl = els.anims.head;
    if (type === PHASES.BODY) animEl = els.anims.body;
    if (type === PHASES.TAP) animEl = els.anims.bottom;
    
    if (animEl) {
        animEl.style.opacity = 1;
        clearTimeout(animEl.timeoutId);
        animEl.timeoutId = setTimeout(() => {
            animEl.style.opacity = 0;
        }, 150);
    }
    
    // 4. Комбо дисплей
    if (state.combo >= 1.5) {
        els.ui.combo.classList.remove('hidden');
        els.ui.combo.textContent = `x${state.combo.toFixed(1)}`;
    }
    
    // 5. Легкая вибрация
    tg.HapticFeedback.impactOccurred('light');
}

function updateScoreUI() {
    // Обновляем текст
    els.ui.scoreText.textContent = `${Math.floor(state.score)} / ${CONFIG.WIN_SCORE}`;
    
    // Обновляем бар
    const pct = Math.min(100, (state.score / CONFIG.WIN_SCORE) * 100);
    els.ui.progressFill.style.width = `${pct}%`;
}

function spawnFloatingText(text, x, y, className) {
    const el = document.createElement('div');
    el.textContent = text;
    el.className = `floating-text ${className}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    
    els.ui.particles.appendChild(el);
    
    // Удаляем после анимации
    setTimeout(() => {
        el.remove();
    }, 800);
}

// --- 6. GAME OVER ---

function finishGame() {
    state.isPlaying = false;
    clearInterval(secTimerId);
    cancelAnimationFrame(loopId);
    
    els.screens.game.classList.remove('active');
    els.screens.result.classList.add('active');
    
    els.ui.resultScore.textContent = Math.floor(state.score);
    
    // Сохранение рекорда
    const savedBest = localStorage.getItem('cockumber_best') || 0;
    if (state.score > savedBest) {
        localStorage.setItem('cockumber_best', Math.floor(state.score));
        els.ui.bestScore.textContent = Math.floor(state.score);
    } else {
        els.ui.bestScore.textContent = savedBest;
    }
    
    // Логика победы
    if (state.score >= CONFIG.WIN_SCORE) {
        els.ui.resultTitle.textContent = "ПОБЕДА!";
        els.ui.resultTitle.style.color = "#55ff55";
        els.ui.resultMsg.textContent = "Огурец идеально натерт и доволен!";
    } else {
        els.ui.resultTitle.textContent = "ФИАСКО";
        els.ui.resultTitle.style.color = "#ff5555";
        els.ui.resultMsg.textContent = `Не хватило ${CONFIG.WIN_SCORE - Math.floor(state.score)} очков.`;
    }
}

// Инит при загрузке (показываем рекорд)
const initBest = localStorage.getItem('cockumber_best') || 0;
els.ui.bestScore.textContent = initBest;