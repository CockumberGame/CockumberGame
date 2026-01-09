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

// Константы
const LEVEL_TIME = 60; // секунд на уровень
const ZONE_TYPES = ['top', 'middle', 'bottom']; // типы зон: верх, середина, низ
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
let isTouching = false;
let touchStartY = 0;
let isGameActive = false;

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

// Генерация зон для уровня (случайный порядок)
function generateZones() {
    zones = [];
    const zoneCount = 10; // количество зон на уровень
    for (let i = 0; i < zoneCount; i++) {
        const type = ZONE_TYPES[Math.floor(Math.random() * ZONE_TYPES.length)];
        // Случайные координаты в пределах примерных областей картинки
        const x = 30 + Math.random() * 40; // 30–70% ширины
        let y;
        if (type === 'top') y = 15 + Math.random() * 20;       // верх
        else if (type === 'middle') y = 40 + Math.random() * 20; // середина
        else y = 70 + Math.random() * 20;                     // низ
        zones.push({ x, y, type });
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
    zone.style.display = 'block';
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
}

// Обновление счёта
function updateScore() {
    scoreEl.textContent = `Очки: ${score}`;
}

// Обработка касаний
zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!isGameActive) return;
    isTouching = true;
    touchStartY = e.touches[0].clientY;
});

zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isTouching || !isGameActive) return;
    const delta = Math.abs(e.touches[0].clientY - touchStartY);
    // Прогресс увеличивается от трения
    progress += delta * 0.05;
    if (progress > 100) progress = 100;
    updateProgress();
    // Вибрация при почти полном прогрессе
    if (progress > 90) navigator.vibrate(30);
});

zone.addEventListener('touchend', () => {
    if (!isGameActive) return;
    isTouching = false;
    // Начисление очков в зависимости от скорости заполнения
    if (progress >= 90) {
        const zoneScore = Math.floor(100 + timeLeft * 2);
        score += zoneScore;
        updateScore();
    } else {
        // Штраф за медленное выполнение
        score -= 30;
        updateScore();
    }
    currentZoneIndex++;
    progress = 0;
    updateProgress();
    spawnZone();
});

// Завершение уровня
function finishLevel() {
    clearInterval(timer);
    if (score >= 500) { // Условие перехода на следующий уровень
        currentLevel++;
        setTimeout(() => loadLevel(), 1000);
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
        resultText.textContent = 'Ты победил! Все огурцы затерты!';
    } else {
        resultText.textContent = 'Игра окончена';
    }
    finalScoreEl.textContent = `Итоговые очки: ${score}`;
}

// Инициализация
resetGame();