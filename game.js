// === CANVAS SETUP ===
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);


// === UI ELEMENTS ===
const menu = document.getElementById("menu");
const resultScreen = document.getElementById("resultScreen");
const startBtn = document.getElementById("startBtn");
const nextLevelBtn = document.getElementById("nextLevelBtn");
const restartBtn = document.getElementById("restartBtn");


// === GAME STATE ===
let currentLevel = 1;
let totalScore = 0;

let cucumberImg = new Image();
cucumberImg.src = "assets/cucumber1.png";


// === START GAME ===
startBtn.onclick = () => {
    menu.classList.add("hidden");
    startLevel(1);
};

restartBtn.onclick = () => {
    resultScreen.classList.add("hidden");
    currentLevel = 1;
    totalScore = 0;
    startLevel(1);
};

nextLevelBtn.onclick = () => {
    resultScreen.classList.add("hidden");
    startLevel(currentLevel);
};


// === MAIN LEVEL START ===
function startLevel(lvl) {
    currentLevel = lvl;
    loadLevelData(lvl).then(levelData => {
        level = levelData;
        cucumberImg.src = level.sprite;
        startLevelLoop();
    });
}


// === LOAD JSON ===
async function loadLevelData(num) {
    const res = await fetch(`levels/level${num}.json`);
    return res.json();
}


// === GAME LOOP ===
function startLevelLoop() {
    function loop() {
        draw();
        requestAnimationFrame(loop);
    }
    loop();
}


// === DRAW ===
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // центрируем огурчик
    let w = canvas.width * 0.6;
    let h = w * 2;
    let x = (canvas.width - w) / 2;
    let y = (canvas.height - h) / 2;

    ctx.drawImage(cucumberImg, x, y, w, h);

    // TODO: здесь будут зоны, эффекты, прогресс-бар
}
