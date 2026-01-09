// Game.js
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const menu = document.getElementById('menu');
const game = document.getElementById('game');
const result = document.getElementById('result');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const timerEl = document.getElementById('timer');
const progressFill = document.getElementById('progressFill');
const playfield = document.getElementById('playfield');
const zone = document.getElementById('zone');
const cucumber = document.getElementById('cucumber');
const resultText = document.getElementById('resultText');

let levelTime = 60; // секунд на уровень
let timer;
let progress = 0;
let zones = [];
let currentZoneIndex = 0;

// уровни — картинки огурчиков
const cucumbers = [
  "assets/cucumber1.jpg",
  "assets/cucumber2.jpg",
  "assets/cucumber3.jpg",
  "assets/cucumber4.jpg",
  "assets/cucumber5.jpg"
];
let currentLevel = 0;

startBtn.addEventListener('click', () => {
  menu.classList.remove('active');
  game.classList.add('active');
  startLevel();
});

retryBtn.addEventListener('click', () => {
  result.classList.remove('active');
  menu.classList.add('active');
});

function startLevel() {
  progress = 0;
  updateProgress();
  currentZoneIndex = 0;
  cucumber.src = cucumbers[currentLevel];
  generateZones();
  startTimer();
  spawnZone();
}

// таймер уровня
function startTimer() {
  let timeLeft = levelTime;
  timerEl.textContent = timeLeft;
  clearInterval(timer);
  timer = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if(timeLeft <= 0) {
      clearInterval(timer);
      endLevel();
    }
  }, 1000);
}

// создаём зоны (верх, середина, низ)
function generateZones() {
  zones = [];
  for(let i=0; i<10; i++) {
    const typeRoll = Math.floor(Math.random()*3);
    let type;
    if(typeRoll === 0) type = 'circle';
    if(typeRoll === 1) type = 'vertical';
    if(typeRoll === 2) type = 'tap';

    const x = 30 + Math.random()*40; // 30–70% ширины
    const y = 20 + Math.random()*60; // 20–80% высоты
    zones.push({x, y, type});
  }
}

// показываем текущую зону
function spawnZone() {
  if(currentZoneIndex >= zones.length) {
    zone.style.display = 'none';
    return;
  }
  const z = zones[currentZoneIndex];
  zone.style.left = z.x + '%';
  zone.style.top = z.y + '%';
  zone.style.display = 'block';
}

// обновляем прогресс-бар
function updateProgress() {
  progressFill.style.width = progress + '%';
}

// логика трения / тап
let isTouching = false;
let touchStartY = 0;

zone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isTouching = true;
  touchStartY = e.touches[0].clientY;
});

zone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if(!isTouching) return;

  const delta = Math.abs(e.touches[0].clientY - touchStartY);
  progress += delta * 0.05; // коэффициент трения
  if(progress > 100) progress = 100;
  updateProgress();

  if(progress > 90) navigator.vibrate(50);
});

zone.addEventListener('touchend', () => {
  isTouching = false;
  currentZoneIndex++;
  spawnZone();
});

// конец уровня
function endLevel() {
  clearInterval(timer);
  game.classList.remove('active');
  result.classList.add('active');

  if(progress >= 93) {
    resultText.textContent = "Ты победил!";
    currentLevel++;
    if(currentLevel >= cucumbers.length) currentLevel = 0; // повтор уровней
  } else {
    resultText.textContent = "Попробуй снова!";
  }
}
