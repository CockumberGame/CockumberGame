const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// CONFIG
const LEVEL_TIME = 60;
const EXTRA_ZONE_START_TIME = 40; // Появится, когда таймер пройдет 40 сек (останется 20)
const WIN_SCORE = 2000;

const ZONES = {
    HEAD: 'head',
    BODY: 'body',
    BOTTOM: 'bottom'
};

// STATE
let state = {
    isPlaying: false,
    score: 0,
    timeElapsed: 0,
    combo: 1.0,
    lastActionTime: 0,
    activeZones: [] // Какие зоны сейчас требуют внимания (для подсветки)
};

let timerInterval;

// DOM Elements
const els = {
    screens: document.querySelectorAll('.screen'),
    score: document.getElementById('game-score'),
    timerFill: document.getElementById('timer-fill'),
    finalScore: document.getElementById('final-score'),
    headZone: document.getElementById('zone-head'),
    bodyZone: document.getElementById('zone-body'),
    bottomZone: document.getElementById('zone-bottom'),
    extraZone: document.getElementById('zone-head-extra'),
    tapTargets: [document.getElementById('tap-target-1'), document.getElementById('tap-target-2')],
    animLayers: {
        head: document.getElementById('anim-head'),
        body: document.getElementById('anim-body'),
        bottom: document.getElementById('anim-bottom')
    }
};

// === CORE ===

function init() {
    document.getElementById('btn-start').onclick = startGame;
    document.getElementById('btn-retry').onclick = startGame;
    
    setupGestures();
}

function startGame() {
    showScreen('screen-game');
    resetState();
    gameLoop();
}

function resetState() {
    state.score = 0;
    state.timeElapsed = 0;
    state.combo = 1.0;
    state.isPlaying = true;
    updateUI();
    
    // Сброс таймера
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        state.timeElapsed++;
        updateTimer();
        checkEvents(); // Проверка на появление экстра зон
        
        if (state.timeElapsed >= LEVEL_TIME) {
            endGame();
        }
    }, 1000);

    // Логика рандомного появления целей для тапа
    spawnTapTargets();
}

function showScreen(id) {
    els.screens.forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function endGame() {
    state.isPlaying = false;
    clearInterval(timerInterval);
    
    const isWin = state.score >= WIN_SCORE;
    const resultTitle = document.getElementById('result-title');
    const resultMsg = document.getElementById('result-msg');
    const nextBtn = document.getElementById('btn-next');
    
    els.finalScore.textContent = Math.floor(state.score);
    
    if (isWin) {
        resultTitle.textContent = "ПОБЕДА!";
        resultTitle.style.color = "#55ff55";
        resultMsg.textContent = "Огурец отлично натерт!";
        nextBtn.classList.remove('hidden');
    } else {
        resultTitle.textContent = "ПОРАЖЕНИЕ";
        resultTitle.style.color = "#ff5555";
        resultMsg.textContent = `Нужно ${WIN_SCORE} очков`;
        nextBtn.classList.add('hidden');
    }
    
    showScreen('screen-result');
}

// === GAMEPLAY LOGIC ===

function addScore(basePoints, x, y) {
    // Комбо сбрасывается если долго не трогал (2 сек)
    if (Date.now() - state.lastActionTime > 2000) state.combo = 1.0;
    state.lastActionTime = Date.now();
    
    // Увеличение комбо (макс x3)
    state.combo = Math.min(state.combo + 0.05, 3.0);
    
    const points = basePoints * state.combo;
    state.score += points;
    updateUI();
    
    // Визуальный эффект (по желанию можно добавить всплывающие цифры)
    showFloatingText(`+${Math.floor(points)}`, x, y);
}

function updateUI() {
    els.score.textContent = Math.floor(state.score);
    const comboEl = document.getElementById('combo-display');
    if (state.combo > 1.2) {
        comboEl.classList.remove('hidden');
        comboEl.textContent = `x${state.combo.toFixed(1)}`;
    } else {
        comboEl.classList.add('hidden');
    }
}

function updateTimer() {
    const pct = 100 - ((state.timeElapsed / LEVEL_TIME) * 100);
    els.timerFill.style.width = `${pct}%`;
    if(pct < 30) els.timerFill.style.background = '#ff5555';
    else els.timerFill.style.background = '#55ff55';
}

function checkEvents() {
    // Появление экстра зоны на голове после 40 сек (когда timeElapsed > 40)
    // Либо если прошло 2/3 времени
    if (state.timeElapsed === EXTRA_ZONE_START_TIME) {
        els.extraZone.classList.remove('hidden');
        tg.HapticFeedback.notificationOccurred('warning');
    }
}

// === GESTURE HANDLERS ===

function setupGestures() {
    
    // 1. HEAD: CIRCULAR MOTION
    let lastAngle = null;
    let accumulatedAngle = 0;
    
    els.headZone.addEventListener('touchmove', (e) => {
        if (!state.isPlaying) return;
        e.preventDefault(); // Блочим скролл
        
        const touch = e.touches[0];
        const rect = els.headZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Вычисляем угол в радианах
        const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
        
        if (lastAngle !== null) {
            let delta = angle - lastAngle;
            // Корректировка перехода через 180/-180 градусов
            if (delta > Math.PI) delta -= 2 * Math.PI;
            if (delta < -Math.PI) delta += 2 * Math.PI;
            
            accumulatedAngle += Math.abs(delta);
            
            // Если накрутили полный оборот (или близко к тому, ~3 радиана)
            if (accumulatedAngle > 1.5) { 
                addScore(10, touch.clientX, touch.clientY);
                accumulatedAngle = 0;
                tg.HapticFeedback.impactOccurred('light');
                triggerAnimation('head');
            }
        }
        lastAngle = angle;
    });
    
    els.headZone.addEventListener('touchend', () => { lastAngle = null; });

    // 1.1 HEAD EXTRA (UP-DOWN)
    let lastExtraY = 0;
    els.extraZone.addEventListener('touchstart', (e) => {
         lastExtraY = e.touches[0].clientY;
    });
    els.extraZone.addEventListener('touchmove', (e) => {
        if(els.extraZone.classList.contains('hidden')) return;
        e.stopPropagation(); // Чтобы не срабатывал обычный круг
        
        const y = e.touches[0].clientY;
        const delta = Math.abs(y - lastExtraY);
        
        if (delta > 20) { // Резкое движение
            addScore(100, e.touches[0].clientX, e.touches[0].clientY); // Много очков!
            state.combo += 0.15; // Бонус к комбо
            lastExtraY = y;
            tg.HapticFeedback.impactOccurred('heavy');
        }
    });

    // 2. BODY: VERTICAL RUB (Long strokes)
    let lastBodyY = 0;
    els.bodyZone.addEventListener('touchstart', (e) => {
        lastBodyY = e.touches[0].clientY;
    });
    
    els.bodyZone.addEventListener('touchmove', (e) => {
        if (!state.isPlaying) return;
        const y = e.touches[0].clientY;
        const delta = Math.abs(y - lastBodyY);
        
        // Длинный свайп
        if (delta > 30) {
            addScore(15, e.touches[0].clientX, e.touches[0].clientY);
            state.combo += 0.1;
            lastBodyY = y;
            triggerAnimation('body');
            
            // Вибрация реже, чтобы не гудело постоянно
            if (Math.random() > 0.5) tg.HapticFeedback.impactOccurred('medium');
        }
    });

    // 3. BOTTOM: TAPPING (Multi-touch)
    // Вешаем обработчики на сами цели (tap targets)
    els.tapTargets.forEach(target => {
        target.addEventListener('touchstart', (e) => {
            if (!state.isPlaying || target.classList.contains('hidden')) return;
            e.preventDefault();
            
            // Проверка комбо (если оба видны и нажаты почти одновременно)
            // Упростим: просто даем очки за тап
            addScore(10, e.touches[0].clientX, e.touches[0].clientY);
            tg.HapticFeedback.impactOccurred('light');
            triggerAnimation('bottom');
            
            // Скрыть после тапа и запустить таймер нового появления
            target.classList.add('hidden');
            setTimeout(spawnTapTargets, Math.random() * 2000 + 500);
        });
    });
}

function spawnTapTargets() {
    if(!state.isPlaying) return;
    
    // Шанс двойного спавна
    const isDouble = Math.random() > 0.7;
    
    if (isDouble) {
        els.tapTargets[0].classList.remove('hidden');
        els.tapTargets[1].classList.remove('hidden');
    } else {
        // Рандомно левый или правый
        const idx = Math.random() > 0.5 ? 0 : 1;
        els.tapTargets[idx].classList.remove('hidden');
    }
}

// === VISUALS ===

function triggerAnimation(part) {
    const el = els.animLayers[part];
    el.style.opacity = 1;
    
    // Сброс анимации через короткое время
    clearTimeout(el.animTimeout);
    el.animTimeout = setTimeout(() => {
        el.style.opacity = 0;
    }, 200);
}

function showFloatingText(text, x, y) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        color: #fff;
        font-weight: bold;
        font-size: 20px;
        pointer-events: none;
        animation: floatUp 0.8s ease-out forwards;
        z-index: 1000;
        text-shadow: 2px 2px 0 #000;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// CSS для всплывающего текста добавим динамически
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes floatUp {
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-50px) scale(1.5); opacity: 0; }
}`;
document.head.appendChild(styleSheet);

init();