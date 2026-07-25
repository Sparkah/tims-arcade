const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const sizeEl = document.getElementById('size');
const citiesEl = document.getElementById('cities');
const gameOverScreen = document.getElementById('gameOver');
const winScreen = document.getElementById('winScreen');
const finalScoreEl = document.getElementById('finalScore');
const winScoreEl = document.getElementById('winScore');

// Game state
let snake = [];
let snakeLength = 15;
let snakeSize = 20;
let score = 0;
let cities = [];
let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;
let gameRunning = true;
let particles = [];

// City names for fun
const cityNames = [
    'Village', 'Town', 'City', 'Metropolis', 'Megacity',
    'Haven', 'Port', 'Capital', 'Empire', 'Kingdom'
];

// Building colors
const buildingColors = [
    '#3498db', '#9b59b6', '#e74c3c', '#f39c12', '#1abc9c',
    '#34495e', '#e67e22', '#2ecc71', '#f1c40f', '#95a5a6'
];

// Initialize snake
function initSnake() {
    snake = [];
    for (let i = 0; i < snakeLength; i++) {
        snake.push({
            x: canvas.width / 2,
            y: canvas.height / 2
        });
    }
}

// Generate cities
function generateCities() {
    cities = [];
    const cityCount = 40;

    for (let i = 0; i < cityCount; i++) {
        const size = Math.random() * 60 + 15; // 15 to 75
        const city = {
            x: Math.random() * (canvas.width - 100) + 50,
            y: Math.random() * (canvas.height - 100) + 50,
            size: size,
            buildings: generateBuildings(size),
            name: cityNames[Math.floor(Math.random() * cityNames.length)],
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)]
        };
        cities.push(city);
    }

    // Sort by size for proper rendering
    cities.sort((a, b) => b.size - a.size);
}

// Generate buildings for a city
function generateBuildings(citySize) {
    const buildings = [];
    const count = Math.floor(citySize / 10) + 2;

    for (let i = 0; i < count; i++) {
        buildings.push({
            offsetX: (Math.random() - 0.5) * citySize * 0.8,
            offsetY: (Math.random() - 0.5) * citySize * 0.8,
            width: Math.random() * (citySize * 0.3) + citySize * 0.1,
            height: Math.random() * (citySize * 0.5) + citySize * 0.2,
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)]
        });
    }
    return buildings;
}

// Create explosion particles
function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 60,
            color: color,
            size: Math.random() * 8 + 2
        });
    }
}

// Update particles
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.vx *= 0.95;
        p.vy *= 0.95;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// Draw particles
function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life / 60;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// Update snake position
function updateSnake() {
    const head = snake[0];
    const dx = mouseX - head.x;
    const dy = mouseY - head.y;
    const speed = 8;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) {
        head.x += (dx / dist) * speed;
        head.y += (dy / dist) * speed;
    }

    // Keep head in bounds
    head.x = Math.max(snakeSize, Math.min(canvas.width - snakeSize, head.x));
    head.y = Math.max(snakeSize, Math.min(canvas.height - snakeSize, head.y));

    // Update body segments
    for (let i = 1; i < snake.length; i++) {
        const prev = snake[i - 1];
        const curr = snake[i];
        const segDx = prev.x - curr.x;
        const segDy = prev.y - curr.y;
        const segDist = Math.sqrt(segDx * segDx + segDy * segDy);
        const spacing = snakeSize * 0.8;

        if (segDist > spacing) {
            curr.x += (segDx / segDist) * (segDist - spacing);
            curr.y += (segDy / segDist) * (segDist - spacing);
        }
    }
}

// Draw snake
function drawSnake() {
    // Draw body
    for (let i = snake.length - 1; i >= 0; i--) {
        const segment = snake[i];
        const ratio = i / snake.length;
        const segmentSize = snakeSize * (0.5 + ratio * 0.5);

        // Body gradient
        const gradient = ctx.createRadialGradient(
            segment.x, segment.y, 0,
            segment.x, segment.y, segmentSize
        );
        gradient.addColorStop(0, '#4ecdc4');
        gradient.addColorStop(0.7, '#26a69a');
        gradient.addColorStop(1, '#00897b');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(segment.x, segment.y, segmentSize, 0, Math.PI * 2);
        ctx.fill();

        // Scales pattern
        if (i % 3 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, segmentSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw head details
    const head = snake[0];

    // Eyes
    const eyeOffset = snakeSize * 0.3;
    const eyeSize = snakeSize * 0.25;

    // Calculate direction
    let angle = 0;
    if (snake.length > 1) {
        angle = Math.atan2(head.y - snake[1].y, head.x - snake[1].x);
    }

    const leftEyeX = head.x + Math.cos(angle + 0.5) * eyeOffset;
    const leftEyeY = head.y + Math.sin(angle + 0.5) * eyeOffset;
    const rightEyeX = head.x + Math.cos(angle - 0.5) * eyeOffset;
    const rightEyeY = head.y + Math.sin(angle - 0.5) * eyeOffset;

    // White of eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(leftEyeX + Math.cos(angle) * eyeSize * 0.3, leftEyeY + Math.sin(angle) * eyeSize * 0.3, eyeSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rightEyeX + Math.cos(angle) * eyeSize * 0.3, rightEyeY + Math.sin(angle) * eyeSize * 0.3, eyeSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
}

// Draw city
function drawCity(city) {
    // Check if city is edible
    const isEdible = city.size < snakeSize * 1.5;
    const isTooLarge = city.size >= snakeSize * 2;

    // Draw shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(city.x + 5, city.y + 5, city.size, 0, Math.PI * 2);
    ctx.fill();

    // Draw base
    ctx.fillStyle = isEdible ? '#2d4a2d' : (isTooLarge ? '#4a2d2d' : '#3d3d5c');
    ctx.beginPath();
    ctx.arc(city.x, city.y, city.size, 0, Math.PI * 2);
    ctx.fill();

    // Draw buildings
    city.buildings.forEach(b => {
        const bx = city.x + b.offsetX;
        const by = city.y + b.offsetY;

        // Building
        ctx.fillStyle = b.color;
        ctx.fillRect(bx - b.width/2, by - b.height, b.width, b.height);

        // Windows
        ctx.fillStyle = '#f1c40f';
        const windowRows = Math.floor(b.height / 8);
        const windowCols = Math.floor(b.width / 6);
        for (let r = 0; r < windowRows; r++) {
            for (let c = 0; c < windowCols; c++) {
                if (Math.random() > 0.3) {
                    ctx.fillRect(
                        bx - b.width/2 + 3 + c * 6,
                        by - b.height + 3 + r * 8,
                        3, 4
                    );
                }
            }
        }
    });

    // Draw city name and size indicator
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(10, city.size / 5)}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(city.name, city.x, city.y + city.size + 15);

    // Size indicator
    if (isEdible) {
        ctx.fillStyle = '#4ecdc4';
        ctx.fillText('EAT!', city.x, city.y - city.size - 5);
    } else if (isTooLarge) {
        ctx.fillStyle = '#e74c3c';
        ctx.fillText('TOO BIG!', city.x, city.y - city.size - 5);
    }
}

// Check collisions
function checkCollisions() {
    const head = snake[0];

    for (let i = cities.length - 1; i >= 0; i--) {
        const city = cities[i];
        const dx = head.x - city.x;
        const dy = head.y - city.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if snake can eat this city
        if (dist < snakeSize + city.size * 0.5) {
            if (city.size < snakeSize * 1.5) {
                // Eat the city!
                score += Math.floor(city.size * 10);
                snakeSize += city.size * 0.15;
                snakeLength += Math.floor(city.size / 10) + 1;

                // Add new segments
                const tail = snake[snake.length - 1];
                for (let j = 0; j < Math.floor(city.size / 10) + 1; j++) {
                    snake.push({ x: tail.x, y: tail.y });
                }

                // Create explosion
                createExplosion(city.x, city.y, city.color, Math.floor(city.size));

                // Remove city
                cities.splice(i, 1);

                // Check win condition
                if (cities.length === 0) {
                    gameRunning = false;
                    winScoreEl.textContent = score;
                    winScreen.style.display = 'block';
                }
            } else if (city.size >= snakeSize * 2) {
                // Hit a city too large - game over
                gameRunning = false;
                finalScoreEl.textContent = score;
                gameOverScreen.style.display = 'block';
            }
        }
    }
}

// Draw background grid
function drawBackground() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// Update UI
function updateUI() {
    scoreEl.textContent = `Score: ${score}`;
    sizeEl.textContent = `Snake Size: ${Math.floor(snakeSize)}`;
    citiesEl.textContent = `Cities: ${cities.length}`;
}

// Main game loop
function gameLoop() {
    if (!gameRunning) return;

    drawBackground();

    // Draw cities
    cities.forEach(city => drawCity(city));

    // Update and draw snake
    updateSnake();
    drawSnake();

    // Update and draw particles
    updateParticles();
    drawParticles();

    // Check collisions
    checkCollisions();

    // Update UI
    updateUI();

    requestAnimationFrame(gameLoop);
}

// Mouse tracking
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// Touch support
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mouseX = e.touches[0].clientX - rect.left;
    mouseY = e.touches[0].clientY - rect.top;
});

// Restart game
function restartGame() {
    snake = [];
    snakeLength = 15;
    snakeSize = 20;
    score = 0;
    particles = [];
    gameRunning = true;
    gameOverScreen.style.display = 'none';
    winScreen.style.display = 'none';
    initSnake();
    generateCities();
    gameLoop();
}

document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('restartBtn2').addEventListener('click', restartGame);

// Start game
initSnake();
generateCities();
gameLoop();
