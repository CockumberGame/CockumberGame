// Game.js
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Элементы
const menu = document.getElementById('menu');
const game = document.getElementById('game');
const result = document.getElementById('result');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const timerEl = document.getElementById('timer');
const progressFill = document.getElementById('progressFill');
const cucumber = document.getElementById('cucumber');
const zone = document.getElementById('zone');
const resultText = document.getElementById('resultText');
const finalScoreEl = document.getElementById('finalScore');
const scoreEl = document.getElementById('score');

// Константы игры
const LEVEL_TIME = 30; // Уменьшаем до 30 секунд для динамики
const CUCUMBERS = [
    'assets/cucumber1.jpg',
    'assets/cucumber2.jpg',
    'assets/cucumber3.jpg',
    'assets/cucumber4.jpg',
    'assets/cucumber5.jpg'
];

// Игровые переменные
let currentLevel = 0;
let timer;
let timeLeft;
let progress = 0;
let score = 0;
let zones = [];
let currentZoneIndex = 0;
let isGameActive = false;

// Типы зон и их настройки
const ZONE_TYPES = {
    CIRCLE: {
        name: 'circle',
        desc: 'КРУГИ',
        className: 'zone-circle',
        progressPerAction: 15, // Прогресс за один круг
        scorePerAction: 50,
        requiredActions: 3, // Нужно сделать 3 круговых движения
        currentActions: 0
    },
    VERTICAL: {
        name: 'vertical',
        desc: 'ВВЕРХ-ВНИЗ',
        className: 'zone-vertical',
        progressPerAction: 10, // Прогресс за одно движение вверх-вниз
        scorePerAction: 30,
        requiredActions: 5,
        currentActions: 0
    },
    TAP: {
        name: 'tap',
        desc: 'БЫСТРЫЙ ТАП',
        className: 'zone-tap',
        progressPerAction: 8, // Прогресс за один тап
        scorePerAction: 20,
        requiredActions: 10,
        currentActions: 0
    }
};

// Начало игры
startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', () => {
    result.classList.remove('active');
    menu.classList.add('active');
    resetGame();
});

function startGame() {
    menu.classList.remove('active');
    game.classList.add('active');
    currentLevel = 0;
    score = 0;
    updateScore();
    loadLevel();
}

function resetGame() {
    progress = 0;
    score = 0;
    updateProgress();
    updateScore();
    clearInterval(timer);
}

// Загрузка уровня
function loadLevel() {
    if (currentLevel >= CUCUMBERS.length) {
        endGame(true);
        return;
    }
    
    cucumber.src = CUCUMBERS[currentLevel];
    progress = 0;
    currentZoneIndex = 0;
    updateProgress();
    generateZones();
    startTimer();
    spawnZone();
    isGameActive = true;
}

// Генерация 8 зон для уровня
function generateZones() {
    zones = [];
    const zoneCount = 8;
    
    for (let i = 0; i < zoneCount; i++) {
        const zoneTypes = Object.values(ZONE_TYPES);
        const zoneType = zoneTypes[Math.floor(Math.random() * zoneTypes.length)];
        
        // Позиционируем зоны в зависимости от типа
        let x, y;
        
        switch(zoneType.name) {
            case 'circle': // Верхняя часть огурца
                x = 40 + Math.random() * 30;
                y = 15 + Math.random() * 15;
                break;
            case 'vertical': // Середина огурца
                x = 45 + Math.random() * 20;
                y = 35 + Math.random() * 30;
                break;
            case 'tap': // Нижняя часть огурца
                x = 35 + Math.random() * 30;
                y = 65 + Math.random() * 20;
                break;
        }
        
        zones.push({
            x,
            y,
            type: zoneType,
            completed: false
        });
    }
}

// Показать текущую зону
function spawnZone() {
    if (currentZoneIndex >= zones.length) {
        finishLevel();
        return;
    }
    
    const zoneData = zones[currentZoneIndex];
    zone.style.left = zoneData.x + '%';
    zone.style.top = zoneData.y + '%';
    
    // Устанавливаем класс зоны
    zone.className = '';
    zone.classList.add(zoneData.type.className);
    
    // Сбрасываем счетчик действий для зоны
    zoneData.type.currentActions = 0;
    
    zone.style.display = 'block';
    updateZoneInstructions(zoneData.type);
}

// Обновляем инструкции на экране
function updateZoneInstructions(zoneType) {
    const hud = document.getElementById('hud');
    let instructionEl = document.getElementById('instruction');
    
    if (!instructionEl) {
        instructionEl = document.createElement('div');
        instructionEl.id = 'instruction';
        instructionEl.style.cssText = `
            position: absolute;
            top: 50px;
            left: 0;
            width: 100%;
            text-align: center;
            font-size: 14px;
            color: white;
            text-shadow: 1px 1px 2px black;
        `;
        hud.appendChild(instructionEl);
    }
    
    instructionEl.textContent = `${zoneType.desc}: ${zoneType.currentActions}/${zoneType.requiredActions}`;
}

// Таймер
function startTimer() {
    timeLeft = LEVEL_TIME;
    timerEl.textContent = timeLeft;
    clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timer);
            endLevel(false);
        }
    }, 1000);
}

// Обновление прогресса
function updateProgress() {
    progressFill.style.width = progress + '%';
    
    // Цвет прогресс-бара меняется в зависимости от прогресса
    if (progress < 30) {
        progressFill.style.background = '#ff5555';
    } else if (progress < 70) {
        progressFill.style.background = '#ffaa00';
    } else {
        progressFill.style.background = '#55ff55';
    }
}

// Обновление счёта
function updateScore() {
    scoreEl.textContent = `Очки: ${score}`;
    
    // Цвет счёта меняется в зависимости от значения
    if (score < 0) {
        scoreEl.style.color = '#ff5555';
    } else if (score < 500) {
        scoreEl.style.color = '#ffaa00';
    } else {
        scoreEl.style.color = '#55ff55';
    }
}

// Переменные для отслеживания жестов
let touchStartY = 0;
let touchStartX = 0;
let lastTapTime = 0;
let tapCount = 0;
let isTouchingZone = false;

// Обработка касаний
zone.addEventListener('touchstart', handleTouchStart);
zone.addEventListener('touchmove', handleTouchMove);
zone.addEventListener('touchend', handleTouchEnd);

function handleTouchStart(e) {
    e.preventDefault();
    if (!isGameActive) return;
    
    isTouchingZone = true;
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
    
    const currentZoneType = zones[currentZoneIndex].type;
    
    // Для тапа - увеличиваем счетчик при каждом касании
    if (currentZoneType.name === 'tap') {
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastTapTime;
        
        // Если тапы быстрые (менее 300ms между ними)
        if (timeDiff < 300) {
            tapCount++;
            if (tapCount >= 2) { // Двойной/быстрый тап
                processZoneAction(currentZoneType);
                tapCount = 0;
            }
        } else {
            tapCount = 1;
        }
        
        lastTapTime = currentTime;
        navigator.vibrate(10); // Короткая вибрация
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (!isTouchingZone || !isGameActive) return;
    
    const touch = e.touches[0];
    const currentZoneType = zones[currentZoneIndex].type;
    
    // Для вертикальной зоны - считаем движения вверх-вниз
    if (currentZoneType.name === 'vertical') {
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        // Если движение достаточно большое
        if (deltaY > 50) {
            processZoneAction(currentZoneType);
            touchStartY = touch.clientY; // Сбрасываем точку отсчета
            navigator.vibrate(20);
        }
    }
    // Для круговой зоны - определяем круговое движение
    else if (currentZoneType.name === 'circle') {
        const centerX = zone.offsetLeft + zone.offsetWidth / 2;
        const centerY = zone.offsetTop + zone.offsetHeight / 2;
        const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
        
        // Простая логика для определения кругового движения
        // В реальной игре нужно отслеживать полный круг
        const distance = Math.sqrt(
            Math.pow(touch.clientX - centerX, 2) + 
            Math.pow(touch.clientY - centerY, 2)
        );
        
        if (distance > 20) { // Если движение достаточно далеко от центра
            processZoneAction(currentZoneType);
            navigator.vibrate(15);
        }
    }
}

function handleTouchEnd() {
    isTouchingZone = false;
}

// Обработка действия в зоне
function processZoneAction(zoneType) {
    if (!isGameActive) return;
    
    zoneType.currentActions++;
    
    // Обновляем прогресс
    progress = Math.min(100, progress + zoneType.progressPerAction);
    updateProgress();
    
    // Добавляем очки
    score += zoneType.scorePerAction;
    updateScore();
    
    // Обновляем инструкции
    updateZoneInstructions(zoneType);
    
    // Если зона завершена
    if (zoneType.currentActions >= zoneType.requiredActions) {
        completeCurrentZone();
    }
}

// Завершение текущей зоны
function completeCurrentZone() {
    zones[currentZoneIndex].completed = true;
    
    // Бонус за быстрый проход
    const timeBonus = Math.floor(timeLeft * 3);
    score += timeBonus;
    updateScore();
    
    // Переходим к следующей зоне
    currentZoneIndex++;
    
    // Если все зоны пройдены
    if (currentZoneIndex >= zones.length) {
        progress = 100;
        updateProgress();
        setTimeout(() => finishLevel(), 500);
    } else {
        spawnZone();
    }
}

// Завершение уровня
function finishLevel() {
    clearInterval(timer);
    
    // Если набрано достаточно очков для перехода
    if (score >= 800) {
        currentLevel++;
        
        // Анимация перехода
        zone.style.display = 'none';
        game.classList.add('level-transition');
        
        setTimeout(() => {
            game.classList.remove('level-transition');
            loadLevel();
        }, 1000);
    } else {
        endLevel(false);
    }
}

// Конец уровня (успех/провал)
function endLevel(success) {
    isGameActive = false;
    clearInterval(timer);
    game.classList.remove('active');
    result.classList.add('active');
    
    if (success) {
        resultText.textContent = 'Уровень пройден!';
    } else {
        resultText.textContent = 'Попробуй ещё раз!';
    }
    
    finalScoreEl.textContent = `Итоговые очки: ${score}`;
}

// Конец игры (все уровни пройдены)
function endGame(win) {
    isGameActive = false;
    clearInterval(timer);
    game.classList.remove('active');
    result.classList.add('active');
    
    if (win) {
        resultText.textContent = 'ПОБЕДА! Все огурцы затерты! 🏆';
    } else {
        resultText.textContent = 'Игра окончена';
    }
    
    finalScoreEl.textContent = `Финальный счёт: ${score}`;
}

// Обновляем CSS для переходов между уровнями
const style = document.createElement('style');
style.textContent = `
    .level-transition {
        animation: flash 0.5s ease;
    }
    
    @keyframes flash {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
`;
document.head.appendChild(style);

// Инициализация
resetGame();