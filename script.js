// ===== CONSTANTES =====
const PLAYER_ICONS = {
    X: '<i class="fa-solid fa-xmark" aria-hidden="true"></i>',
    O: '<i class="fa-regular fa-circle" aria-hidden="true"></i>',
};
const DRAW_ICON = '<i class="fa-solid fa-handshake" aria-hidden="true"></i>';

function playerIcon(role) {
    return PLAYER_ICONS[role] || '';
}

// ===== ÉTAT GLOBAL =====
let localMode = false;
let aiMode = false;
let aiRole = 'O';            // Côté joué par l'IA (humain = autre)
let aiDifficulty = 'medium'; // 'easy' | 'medium' | 'hard' | 'ultra'
let aiThinking = false;
let socket;
let role = null;       // 'X' | 'O' | null (spectateur)
let roomId = null;
let nicknameCache = localStorage.getItem('smv2_nickname') || '';
let lastPeer = { i: null, j: null };
let cursorThrottle = 0;
let roomTtlTimer = null;
let roomsTtlTimer = null;
let roomsPollTimer = null;

// Références DOM (construites par createPage.js)
let bigCells = [];
let smallCellsMatrix = [];

// État du jeu (miroir serveur ou état local)
let state = newEmptyState();

function newEmptyState() {
    return {
        turn: 'X',
        lastPlayed: 0,
        jokerMode: true,
        completedCells: [],
        smallBoards: Array.from({ length: 9 }, () => Array(9).fill('')),
        bigBoard: Array(9).fill(''),
        score: { X: 0, O: 0 },
    };
}

// ===== GESTION DES ÉCRANS =====
function showScreen(name) {
    document.getElementById('screen-menu').classList.toggle('hidden', name !== 'menu');
    document.getElementById('screen-lobby').classList.toggle('hidden', name !== 'lobby');
    document.getElementById('screen-game').classList.toggle('hidden', name !== 'game');
}

// ===== MODE LOCAL =====
function startLocalGame() {
    localMode = true;
    aiMode = false;
    state = newEmptyState();
    document.getElementById('player-x-name').textContent = 'Joueur X';
    document.getElementById('player-o-name').textContent = 'Joueur O';
    document.getElementById('room-badge').classList.add('hidden');
    document.getElementById('room-info-bar').classList.add('hidden');
    showScreen('game');
    rebuildMatricesAndListeners();
    applyState(state);
}

// ===== MODE IA =====
function startAiGame() {
    localMode = true;
    aiMode = true;
    aiThinking = false;
    state = newEmptyState();
    const diffLabels = { easy: 'facile', medium: 'moyen', hard: 'difficile', ultra: 'ultra' };
    const diffLabel = diffLabels[aiDifficulty] || 'moyen';
    const aiLabel = `IA (${diffLabel})`;
    const humanLabel = 'Toi';
    if (aiRole === 'O') {
        document.getElementById('player-x-name').innerHTML = humanLabel;
        document.getElementById('player-o-name').innerHTML = aiLabel + ' <span class="ai-badge">IA</span>';
    } else {
        document.getElementById('player-x-name').innerHTML = aiLabel + ' <span class="ai-badge">IA</span>';
        document.getElementById('player-o-name').innerHTML = humanLabel;
    }
    document.getElementById('room-badge').classList.add('hidden');
    document.getElementById('room-info-bar').classList.add('hidden');
    showScreen('game');
    rebuildMatricesAndListeners();
    applyState(state);
    scheduleAiIfTurn();
}

function scheduleAiIfTurn() {
    if (!aiMode) return;
    if (state.turn !== aiRole) return;
    if (checkWin3x3(state.bigBoard)) return;
    if (state.bigBoard.every(Boolean)) return;

    aiThinking = true;
    document.getElementById('turn').classList.add('ai-thinking');
    // Ultra réfléchit réellement (negamax), inutile d'ajouter un délai cosmétique.
    const delay = aiDifficulty === 'ultra' ? 120 : 420 + Math.random() * 480;
    setTimeout(() => {
        const move = aiPickMove(state, aiDifficulty);
        aiThinking = false;
        document.getElementById('turn').classList.remove('ai-thinking');
        if (move) handleLocalMove(move.bigIndex, move.smallIndex);
    }, delay);
}

// ===== ALGORITHME IA =====
function enumerateLegalMoves(s) {
    const moves = [];
    for (let big = 0; big < 9; big++) {
        if (s.bigBoard[big]) continue;
        if (!s.jokerMode && s.lastPlayed !== big) continue;
        for (let small = 0; small < 9; small++) {
            if (s.smallBoards[big][small]) continue;
            moves.push({ bigIndex: big, smallIndex: small });
        }
    }
    return moves;
}

function hasWinningMove(smallBoard, r) {
    for (let i = 0; i < 9; i++) {
        if (smallBoard[i]) continue;
        const sim = smallBoard.slice();
        sim[i] = r;
        if (checkWin3x3(sim) === r) return true;
    }
    return false;
}

function countPotentialLines(board, r) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];
    let score = 0;
    for (const [a, b, c] of lines) {
        const pieces = [board[a], board[b], board[c]];
        const mine = pieces.filter(p => p === r).length;
        const theirs = pieces.filter(p => p && p !== r).length;
        if (theirs === 0 && mine > 0) score += mine * mine;
    }
    return score;
}

function evaluateMove(s, move) {
    const r = s.turn;
    const opp = r === 'X' ? 'O' : 'X';
    const { bigIndex, smallIndex } = move;
    let score = 0;

    const simSmall = s.smallBoards[bigIndex].slice();
    simSmall[smallIndex] = r;
    const smallWins = checkWin3x3(simSmall) === r;

    if (smallWins) {
        score += 80;
        const simBig = s.bigBoard.slice();
        simBig[bigIndex] = r;
        if (checkWin3x3(simBig) === r) return 10000;
        score += countPotentialLines(simBig, r) * 8;
        score -= countPotentialLines(simBig, opp) * 5;
    } else {
        // Bloquer une victoire adverse sur la petite grille
        const oppSim = s.smallBoards[bigIndex].slice();
        oppSim[smallIndex] = opp;
        if (checkWin3x3(oppSim) === opp) score += 35;
    }

    if (smallIndex === 4) score += 3;
    else if ([0, 2, 6, 8].includes(smallIndex)) score += 1;
    if (bigIndex === 4) score += 2;
    else if ([0, 2, 6, 8].includes(bigIndex)) score += 1;

    // Où envoie-t-on l'adversaire ?
    const nextTarget = smallIndex;
    const nextTargetWon = s.bigBoard[nextTarget] !== '' || (smallWins && bigIndex === nextTarget);
    if (nextTargetWon) {
        score -= 25; // joker pour l'adversaire : mauvais
    } else {
        const nextSmall = (nextTarget === bigIndex) ? simSmall : s.smallBoards[nextTarget];
        if (hasWinningMove(nextSmall, opp)) {
            score -= 50;
            const bigTest = s.bigBoard.slice();
            if (smallWins) bigTest[bigIndex] = r;
            bigTest[nextTarget] = opp;
            if (checkWin3x3(bigTest) === opp) score -= 400;
        }
    }

    score += Math.random() * 0.6;
    return score;
}

function applyMoveSim(s, move) {
    const r = s.turn;
    const newSmallBoards = s.smallBoards.slice();
    const movedBoard = s.smallBoards[move.bigIndex].slice();
    movedBoard[move.smallIndex] = r;
    newSmallBoards[move.bigIndex] = movedBoard;

    const next = {
        turn: r === 'X' ? 'O' : 'X',
        lastPlayed: move.smallIndex,
        jokerMode: s.jokerMode,
        completedCells: s.completedCells,
        smallBoards: newSmallBoards,
        bigBoard: s.bigBoard,
        score: s.score,
    };

    const wSmall = checkWin3x3(movedBoard);
    if (wSmall) {
        const newBig = s.bigBoard.slice();
        newBig[move.bigIndex] = wSmall;
        next.bigBoard = newBig;
        if (!s.completedCells.includes(move.bigIndex)) {
            next.completedCells = s.completedCells.concat(move.bigIndex);
        }
        next.jokerMode = true;
    } else {
        next.jokerMode = s.completedCells.includes(move.smallIndex);
    }
    return next;
}

function aiPickMove(s, difficulty) {
    const moves = enumerateLegalMoves(s);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
        // Majoritairement aléatoire, mais bloque/gagne parfois
        if (Math.random() < 0.65) return moves[Math.floor(Math.random() * moves.length)];
    }

    if (difficulty === 'ultra') {
        return aiUltra(s, moves);
    }

    const scored = moves.map(m => ({ move: m, score: evaluateMove(s, m) }));
    scored.sort((a, b) => b.score - a.score);

    if (difficulty === 'hard') {
        const me = s.turn;
        const candidates = scored.slice(0, 6);
        let best = candidates[0];
        let bestVal = -Infinity;
        for (const cand of candidates) {
            const next = applyMoveSim(s, cand.move);
            if (checkWin3x3(next.bigBoard) === me) return cand.move;
            const oppMoves = enumerateLegalMoves(next);
            let oppBest = -Infinity;
            for (const om of oppMoves.slice(0, 14)) {
                const v = evaluateMove(next, om);
                if (v > oppBest) oppBest = v;
            }
            const total = cand.score - (oppBest === -Infinity ? 0 : oppBest * 0.65);
            if (total > bestVal) { bestVal = total; best = cand; }
        }
        return best.move;
    }

    // Medium
    const topScore = scored[0].score;
    const topMoves = scored.filter(m => m.score >= topScore - 4);
    return topMoves[Math.floor(Math.random() * topMoves.length)].move;
}

// Ultra : negamax avec élagage alpha-bêta, profondeur 3, 10 candidats en racine.
function aiUltra(s, moves) {
    const me = s.turn;

    // Victoire immédiate si possible
    for (const m of moves) {
        const next = applyMoveSim(s, m);
        if (checkWin3x3(next.bigBoard) === me) return m;
    }

    const DEPTH = 3;
    const ROOT_CANDIDATES = 10;
    const scored = moves.map(m => ({ move: m, h: evaluateMove(s, m) }));
    scored.sort((a, b) => b.h - a.h);
    const candidates = scored.slice(0, ROOT_CANDIDATES);

    let best = candidates[0].move;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const cand of candidates) {
        const next = applyMoveSim(s, cand.move);
        const val = -negamax(next, DEPTH - 1, -beta, -alpha);
        if (val > bestScore) { bestScore = val; best = cand.move; }
        if (bestScore > alpha) alpha = bestScore;
    }
    return best;
}

function negamax(s, depth, alpha, beta) {
    // Le joueur courant vient d'hériter de la position : si la grande grille est gagnée,
    // c'est que le coup précédent a fait gagner l'adversaire.
    const bigWin = checkWin3x3(s.bigBoard);
    if (bigWin) return -10000 - depth;
    if (s.bigBoard.every(Boolean)) return 0;
    if (depth === 0) return leafEval(s);

    const moves = enumerateLegalMoves(s);
    if (moves.length === 0) return 0;

    const sorted = moves.map(m => ({ m, h: evaluateMove(s, m) }))
        .sort((a, b) => b.h - a.h);
    const BRANCH = 8;
    const pruned = sorted.length > BRANCH ? sorted.slice(0, BRANCH) : sorted;

    let value = -Infinity;
    for (const { m } of pruned) {
        const next = applyMoveSim(s, m);
        const v = -negamax(next, depth - 1, -beta, -alpha);
        if (v > value) value = v;
        if (value > alpha) alpha = value;
        if (alpha >= beta) break;
    }
    return value;
}

function leafEval(s) {
    const me = s.turn;
    const opp = me === 'X' ? 'O' : 'X';
    let score = 0;
    let myBigs = 0, oppBigs = 0;
    for (const v of s.bigBoard) {
        if (v === me) myBigs++;
        else if (v === opp) oppBigs++;
    }
    score += (myBigs - oppBigs) * 120;
    score += countPotentialLines(s.bigBoard, me) * 25;
    score -= countPotentialLines(s.bigBoard, opp) * 25;
    for (let b = 0; b < 9; b++) {
        if (s.bigBoard[b]) continue;
        score += countPotentialLines(s.smallBoards[b], me);
        score -= countPotentialLines(s.smallBoards[b], opp);
    }
    return score;
}

// ===== TUTORIEL INTERACTIF =====
let tutCurrentStep = 0;

const TUTORIAL_STEPS = [
    {
        title: 'Le plateau de jeu',
        text: 'Le Morpion Ultime se joue sur <b>9 petites grilles</b> organisées comme un grand morpion. Ton but : en <b>aligner 3</b> (ligne, colonne ou diagonale) sur la grande grille.',
        bigBoard: Array(9).fill(''),
        smallBoards: Array.from({ length: 9 }, () => Array(9).fill('')),
        completedCells: [], jokerMode: true, lastPlayed: -1, turn: 'X',
        highlightBig: [0, 1, 2, 3, 4, 5, 6, 7, 8], dimBig: [],
    },
    {
        title: 'La règle clé 🔗',
        text: '❌ joue dans la <b>case n°5</b> (centre) de la grille 1. Cette position <b>détermine la prochaine grille</b> : ⭕ doit jouer dans la <b>grille n°5</b> (centrale), surlignée en violet.',
        bigBoard: Array(9).fill(''),
        smallBoards: (() => { const b = Array.from({ length: 9 }, () => Array(9).fill('')); b[0][4] = 'X'; return b; })(),
        completedCells: [], jokerMode: false, lastPlayed: 4, turn: 'O',
        highlightBig: [4], dimBig: [0, 1, 2, 3, 5, 6, 7, 8],
        newPiece: { big: 0, small: 4 },
    },
    {
        title: 'Jouer dans la bonne grille',
        text: '⭕ <b>doit</b> jouer dans la grille n°5 (en violet). Il choisit la case n°3 (haut à droite) → envoie ❌ dans la <b>grille n°3</b>. Chaque coup contrôle où va l\'adversaire !',
        bigBoard: Array(9).fill(''),
        smallBoards: (() => { const b = Array.from({ length: 9 }, () => Array(9).fill('')); b[0][4] = 'X'; b[4][2] = 'O'; return b; })(),
        completedCells: [], jokerMode: false, lastPlayed: 2, turn: 'X',
        highlightBig: [2], dimBig: [0, 1, 3, 4, 5, 6, 7, 8],
        newPiece: { big: 4, small: 2 },
    },
    {
        title: 'Gagner une petite grille',
        text: 'Aligne <b>3 cases</b> dans une petite grille pour la <b>remporter</b> ! Elle est remplacée par ton grand symbole. ❌ vient d\'aligner la colonne gauche de la grille 1 → ❌ <b>remporte la grille 1 !</b>',
        bigBoard: ['X', '', '', '', '', '', '', '', ''],
        smallBoards: (() => {
            const b = Array.from({ length: 9 }, () => Array(9).fill(''));
            b[0][0] = 'X'; b[0][3] = 'X'; b[0][6] = 'X'; b[0][1] = 'O'; b[0][4] = 'O';
            b[4][2] = 'O'; b[2][5] = 'X';
            return b;
        })(),
        completedCells: [0], jokerMode: true, lastPlayed: 6, turn: 'O',
        highlightBig: [0], dimBig: [],
    },
    {
        title: 'Mode Joker 🃏',
        text: '⭕ joue dans la case n°1 → renvoie ❌ dans la <b>grille n°1</b>. Mais ❌ l\'a déjà gagnée ! ❌ est en <b>mode Joker</b> : il peut jouer dans <b>n\'importe quelle grille libre</b>.',
        bigBoard: ['X', '', '', '', '', '', '', '', ''],
        smallBoards: (() => {
            const b = Array.from({ length: 9 }, () => Array(9).fill(''));
            b[0][0] = 'X'; b[0][3] = 'X'; b[0][6] = 'X'; b[0][1] = 'O'; b[0][4] = 'O';
            b[4][2] = 'O'; b[2][5] = 'X'; b[2][0] = 'O';
            return b;
        })(),
        completedCells: [0], jokerMode: true, lastPlayed: 0, turn: 'X',
        highlightBig: [1, 2, 3, 4, 5, 6, 7, 8], dimBig: [],
        newPiece: { big: 2, small: 0 },
    },
    {
        title: 'Remporter la partie 🏆',
        text: 'Pour <b>gagner</b>, aligne 3 petites grilles gagnées sur la grande — comme au morpion classique ! ❌ aligne les grilles <b>1, 5 et 9 en diagonale</b> → Victoire !',
        bigBoard: ['X', 'O', '', 'O', 'X', '', '', '', 'X'],
        smallBoards: Array.from({ length: 9 }, () => Array(9).fill('')),
        completedCells: [0, 1, 3, 4, 8], jokerMode: true, lastPlayed: 8, turn: 'O',
        highlightBig: [0, 4, 8], dimBig: [1, 2, 3, 5, 6, 7],
    },
    {
        title: 'Pense à l\'avance 💡',
        text: 'Avant chaque coup, demande-toi : <b>dans quelle grille est-ce que j\'envoie l\'adversaire ?</b> S\'il y est à l\'aise, il marquera un point et choisira ensuite <b>où toi tu dois jouer</b>. Anticipe !',
        bigBoard: ['X', '', '', '', '', '', '', '', 'O'],
        smallBoards: (() => {
            const b = Array.from({ length: 9 }, () => Array(9).fill(''));
            b[1][4] = 'X'; b[1][0] = 'O'; b[1][6] = 'X';
            b[2][3] = 'O'; b[2][4] = 'X'; b[2][7] = 'O';
            b[3][1] = 'X'; b[3][5] = 'O'; b[3][3] = 'X';
            b[4][0] = 'O'; b[4][4] = 'X'; b[4][2] = 'O'; b[4][8] = 'X';
            b[5][5] = 'X'; b[5][3] = 'O'; b[5][0] = 'X';
            b[6][7] = 'O'; b[6][2] = 'X'; b[7][4] = 'X'; b[7][0] = 'O';
            return b;
        })(),
        completedCells: [0, 8], jokerMode: false, lastPlayed: 3, turn: 'X',
        highlightBig: [3], dimBig: [0, 1, 2, 4, 5, 6, 7, 8],
    },
];

function buildTutBoard(step) {
    const boardEl = document.getElementById('tut-board');
    boardEl.innerHTML = '';
    const { bigBoard, smallBoards, highlightBig = [], dimBig = [], newPiece } = step;

    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.idx = i + 1;

        if (bigBoard[i]) {
            cell.classList.add('big-winner');
            cell.innerHTML = playerIcon(bigBoard[i]);
            if (highlightBig.includes(i)) cell.classList.add('tut-hl');
            if (dimBig.includes(i)) cell.classList.add('tut-dim');
        } else {
            const sb = document.createElement('div');
            sb.className = 'small-board';
            for (let j = 0; j < 9; j++) {
                const sc = document.createElement('div');
                sc.className = 'cell';
                if (smallBoards[i][j]) {
                    sc.innerHTML = playerIcon(smallBoards[i][j]);
                    if (newPiece && newPiece.big === i && newPiece.small === j) {
                        sc.classList.add('tut-new');
                    }
                }
                sb.appendChild(sc);
            }
            cell.appendChild(sb);
            if (highlightBig.includes(i)) cell.classList.add('tut-hl');
            else if (dimBig.includes(i)) cell.classList.add('tut-dim');
        }

        boardEl.appendChild(cell);
    }
}

function renderTutStep(n) {
    const step = TUTORIAL_STEPS[n];
    const total = TUTORIAL_STEPS.length;

    document.getElementById('tut-step-badge').textContent = `${n + 1} / ${total}`;
    document.getElementById('tut-title').textContent = step.title;
    document.getElementById('tut-explanation').innerHTML = step.text;

    buildTutBoard(step);

    const dotsEl = document.getElementById('tut-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const d = document.createElement('button');
        d.className = 'tut-dot' + (i === n ? ' active' : '');
        d.addEventListener('click', () => { tutCurrentStep = i; renderTutStep(i); });
        dotsEl.appendChild(d);
    }

    document.getElementById('tut-prev').style.visibility = n === 0 ? 'hidden' : 'visible';
    const nextBtn = document.getElementById('tut-next');
    nextBtn.innerHTML = n === total - 1
        ? '<i class="fa-solid fa-gamepad" aria-hidden="true"></i> Jouer !'
        : 'Suivant →';
}

function showTutorial() {
    tutCurrentStep = 0;
    renderTutStep(0);
    document.getElementById('tutorial-overlay').classList.remove('hidden');
}
function hideTutorial() {
    document.getElementById('tutorial-overlay').classList.add('hidden');
    localStorage.setItem('smv2_seen_tutorial', '1');
}

function checkWin3x3(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
}

function handleLocalMove(bigIndex, smallIndex) {
    if (state.bigBoard[bigIndex]) return;
    if (state.smallBoards[bigIndex][smallIndex]) return;
    if (!(state.jokerMode || state.lastPlayed === bigIndex)) return;

    const role = state.turn;
    const next = JSON.parse(JSON.stringify(state));
    next.smallBoards[bigIndex][smallIndex] = role;

    const smallWinner = checkWin3x3(next.smallBoards[bigIndex]);
    if (smallWinner) {
        next.bigBoard[bigIndex] = smallWinner;
        if (!next.completedCells.includes(bigIndex)) next.completedCells.push(bigIndex);
        next.jokerMode = true;
    } else {
        next.jokerMode = next.completedCells.includes(smallIndex);
    }
    next.lastPlayed = smallIndex;

    const winner = checkWin3x3(next.bigBoard);
    if (winner) {
        next.score[winner]++;
        applyState(next);
        setTimeout(() => showWinOverlay(winner, next.score, true), 350);
        return;
    }
    if (next.bigBoard.every(Boolean)) {
        applyState(next);
        setTimeout(() => showDrawOverlay(next.score, true), 350);
        return;
    }

    next.turn = role === 'X' ? 'O' : 'X';
    applyState(next);
    scheduleAiIfTurn();
}

// ===== OVERLAY VICTOIRE =====
function showWinOverlay(winner, scores, keepScores) {
    document.getElementById('win-emoji').innerHTML = playerIcon(winner);
    document.getElementById('win-title').textContent = 'Victoire !';
    document.getElementById('win-subtitle').textContent =
        `Joueur ${winner} a gagné la partie !`;
    document.getElementById('win-score-x').textContent = scores.X;
    document.getElementById('win-score-o').textContent = scores.O;

    const btn = document.getElementById('win-continue');
    btn.textContent = localMode ? 'Rejouer' : 'Continuer';
    btn.onclick = () => {
        hideWinOverlay();
        if (localMode) {
            const prevScore = state.score;
            state = newEmptyState();
            if (keepScores) state.score = prevScore;
            rebuildMatricesAndListeners();
            applyState(state);
            scheduleAiIfTurn();
        }
    };

    document.getElementById('win-overlay').classList.remove('hidden');
}

function showDrawOverlay(scores, keepScores) {
    document.getElementById('win-emoji').innerHTML = DRAW_ICON;
    document.getElementById('win-title').textContent = 'Match nul !';
    document.getElementById('win-subtitle').textContent = 'Personne ne gagne cette fois.';
    document.getElementById('win-score-x').textContent = scores.X;
    document.getElementById('win-score-o').textContent = scores.O;

    const btn = document.getElementById('win-continue');
    btn.textContent = localMode ? 'Rejouer' : 'Continuer';
    btn.onclick = () => {
        hideWinOverlay();
        if (localMode) {
            const prevScore = state.score;
            state = newEmptyState();
            if (keepScores) state.score = prevScore;
            rebuildMatricesAndListeners();
            applyState(state);
            scheduleAiIfTurn();
        }
    };

    document.getElementById('win-overlay').classList.remove('hidden');
}

function hideWinOverlay() {
    document.getElementById('win-overlay').classList.add('hidden');
}

// ===== RENDU DU JEU =====
function applyState(s) {
    state = JSON.parse(JSON.stringify(s));
    document.getElementById('score-x').textContent = state.score.X;
    document.getElementById('score-o').textContent = state.score.O;
    document.getElementById('turn').innerHTML = playerIcon(state.turn);

    // Highlight le joueur actif dans le scoreboard
    document.getElementById('score-block-x').classList.toggle('active-turn', state.turn === 'X');
    document.getElementById('score-block-o').classList.toggle('active-turn', state.turn === 'O');

    drawBoards();
    formatPlayableCells(findPlayableCells());
}

function drawBoards() {
    state.bigBoard.forEach((winner, bigIndex) => {
        const big = bigCells[bigIndex];
        if (!big) return;
        if (winner === 'X' || winner === 'O') {
            if (!big.classList.contains('big-winner')) {
                big.classList.add('big-winner');
                big.innerHTML = playerIcon(winner);
            }
        } else {
            big.classList.remove('big-winner');
            let sb = big.querySelector('.small-board');
            if (!sb) {
                sb = document.createElement('div');
                sb.classList.add('small-board');
                for (let j = 0; j < 9; j++) {
                    const sc = document.createElement('div');
                    sc.classList.add('cell');
                    sc.addEventListener('click', () => handleClick(bigIndex, j));
                    sc.addEventListener('mouseenter', () => sendCursor(bigIndex, j));
                    sc.addEventListener('mouseleave', clearPeerCursor);
                    sb.appendChild(sc);
                }
                big.innerHTML = '';
                big.appendChild(sb);
                smallCellsMatrix[bigIndex] = Array.from(sb.querySelectorAll('.cell'));
            }
            const smalls = smallCellsMatrix[bigIndex];
            state.smallBoards[bigIndex].forEach((v, si) => {
                if (smalls[si]) smalls[si].innerHTML = v ? playerIcon(v) : '';
            });
        }
    });
}

function findPlayableCells() {
    return smallCellsMatrix
        .map((_, i) => i)
        .filter(i => !state.bigBoard[i] && (state.jokerMode || state.lastPlayed === i));
}

function formatPlayableCells(playableCells) {
    bigCells.forEach((bigCell, index) => {
        bigCell.classList.remove('playable', 'not-playable', 'completed');
        if (state.bigBoard[index]) {
            bigCell.classList.add('completed');
        } else if (playableCells.includes(index)) {
            bigCell.classList.add('playable');
        } else {
            bigCell.classList.add('not-playable');
        }
    });
}

function rebuildMatricesAndListeners() {
    bigCells = Array.from(document.querySelectorAll('.board > .cell'));
    smallCellsMatrix = bigCells.map((big) => Array.from(big.querySelectorAll('.small-board .cell')));
    bigCells.forEach((big, i) => {
        const smalls = smallCellsMatrix[i];
        smalls.forEach((sc, j) => {
            sc.addEventListener('click', () => handleClick(i, j));
            sc.addEventListener('mouseenter', () => sendCursor(i, j));
            sc.addEventListener('mouseleave', clearPeerCursor);
        });
    });
}

// Point d'entrée unique pour les clics
function handleClick(bigIndex, smallIndex) {
    if (localMode) {
        if (aiMode && (state.turn === aiRole || aiThinking)) return;
        handleLocalMove(bigIndex, smallIndex);
    } else {
        handleOnlineMove(bigIndex, smallIndex);
    }
}

function handleOnlineMove(bigIndex, smallIndex) {
    if (!roomId) return;
    if (!role) return;
    if (state.turn !== role) return;
    if (!(state.jokerMode || state.lastPlayed === bigIndex)) return;
    if (state.bigBoard[bigIndex]) return;
    if (state.smallBoards[bigIndex][smallIndex]) return;

    socket.emit('playMove', { roomId, bigIndex, smallIndex, role }, (res) => {
        if (!res.ok) showToast(res.error || 'Coup refusé', 'warn');
    });
}

// ===== SOCKET.IO =====
function connectSocket() {
    socket = io('/', {
        transports: ['polling'],
        upgrade: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 2000,
        timeout: 10000,
        path: '/socket.io',
    });

    const statusEl = document.getElementById('connection-status');

    socket.on('connect', () => {
        if (statusEl) statusEl.textContent = 'Connecté';
    });

    socket.on('disconnect', () => {
        if (statusEl) statusEl.textContent = 'Déconnecté. Reconnexion…';
    });

    socket.on('connect_error', (err) => {
        if (statusEl) statusEl.textContent = `Erreur: ${err?.message || 'connexion'}`;
    });

    socket.on('stateUpdate', ({ state: s, meta }) => {
        applyState(s);
        if (meta?.winner) {
            setTimeout(() => showWinOverlay(meta.winner, s.score, false), 350);
        } else if (meta?.draw) {
            setTimeout(() => showDrawOverlay(s.score, false), 350);
        }
    });

    socket.on('roomInfo', (info) => {
        if (!info) return;
        const roomEl = document.getElementById('ui-room');
        if (roomEl) roomEl.textContent = info.roomId || '—';

        const xName = info.players?.X?.nickname || 'Joueur X';
        const oName = info.players?.O?.nickname || 'Joueur O';
        document.getElementById('player-x-name').textContent = xName;
        document.getElementById('player-o-name').textContent = oName;

        const oppEl = document.getElementById('ui-opponent');
        if (oppEl) {
            if (role === 'X') {
                oppEl.textContent = info.players?.O ? info.players.O.nickname : 'En attente…';
            } else if (role === 'O') {
                oppEl.textContent = info.players?.X ? info.players.X.nickname : 'En attente…';
            } else {
                oppEl.textContent = `${xName} vs ${oName}`;
            }
        }

        const ttlEl = document.getElementById('ui-ttl');
        if (ttlEl && info.lastActivity && info.ttlMs) {
            document.getElementById('ttl-info')?.classList.remove('hidden');
            startRoomTtlCountdown(ttlEl, info.lastActivity, info.ttlMs);
        }
    });

    socket.on('peerCursor', ({ bigIndex, smallIndex }) => {
        highlightPeerCursor(bigIndex, smallIndex);
    });

    socket.on('playerJoined', ({ role: r, nickname }) => {
        showToast(`${nickname || 'Un joueur'} a rejoint (${r}).`, 'success');
    });

    socket.on('playerLeft', () => {
        showToast('Un joueur a quitté la salle.', 'warn');
    });

    socket.on('roomClosed', ({ reason, roomId: rid }) => {
        showToast(`La salle ${rid} a été fermée (${reason}).`, 'error');
        roomId = null;
        role = null;
        saveSession();
        showScreen('lobby');
    });

    socket.on('roomsUpdated', (list) => renderRoomsList(list));
}

// ===== UI EN LIGNE =====
function enterGameOnline() {
    localMode = false;
    saveSession();
    showScreen('game');
    rebuildMatricesAndListeners();
    document.getElementById('room-badge').classList.remove('hidden');
    document.getElementById('room-info-bar').classList.remove('hidden');
    history.replaceState(null, '', `?room=${roomId}`);
}

function saveSession() {
    if (!roomId) return localStorage.removeItem('smv2_session');
    const nickname = (document.getElementById('nickname')?.value || nicknameCache || '').trim();
    localStorage.setItem('smv2_session', JSON.stringify({ roomId, role, nickname }));
}

function setupUi() {
    // Bouton local
    document.getElementById('btn-local').addEventListener('click', startLocalGame);

    // Bouton en ligne
    document.getElementById('btn-online').addEventListener('click', () => {
        showScreen('lobby');
        refreshRoomsList();
    });

    // Retour lobby → menu
    document.getElementById('btn-back-lobby').addEventListener('click', () => showScreen('menu'));

    // Retour jeu → menu ou lobby
    document.getElementById('btn-back-game').addEventListener('click', () => {
        if (!localMode && roomId && socket) {
            socket.emit('leaveRoom', { roomId });
            roomId = null;
            role = null;
            saveSession();
            history.replaceState(null, '', location.pathname);
            updateRoomsPolling();
            showScreen('lobby');
            refreshRoomsList();
        } else {
            showScreen('menu');
        }
        localMode = false;
        aiMode = false;
        aiThinking = false;
        document.getElementById('turn').classList.remove('ai-thinking');
        hideWinOverlay();
    });

    // Tutoriel
    document.getElementById('btn-help').addEventListener('click', showTutorial);
    document.getElementById('btn-show-tutorial').addEventListener('click', showTutorial);
    document.getElementById('tutorial-x').addEventListener('click', hideTutorial);
    document.getElementById('tut-prev').addEventListener('click', () => {
        if (tutCurrentStep > 0) { tutCurrentStep--; renderTutStep(tutCurrentStep); }
    });
    document.getElementById('tut-next').addEventListener('click', () => {
        if (tutCurrentStep < TUTORIAL_STEPS.length - 1) {
            tutCurrentStep++;
            renderTutStep(tutCurrentStep);
        } else {
            hideTutorial();
        }
    });

    // Configuration IA
    const aiOverlay = document.getElementById('ai-config-overlay');
    document.getElementById('btn-ai').addEventListener('click', () => {
        aiOverlay.classList.remove('hidden');
    });
    document.getElementById('ai-cancel').addEventListener('click', () => {
        aiOverlay.classList.add('hidden');
    });
    document.getElementById('ai-start').addEventListener('click', () => {
        aiOverlay.classList.add('hidden');
        startAiGame();
    });

    const diffGroup = document.getElementById('ai-difficulty');
    diffGroup.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            diffGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            aiDifficulty = btn.dataset.value;
        });
    });
    const sideGroup = document.getElementById('ai-side');
    sideGroup.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sideGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            aiRole = btn.dataset.value === 'X' ? 'O' : 'X';
        });
    });

    // Créer une salle
    document.getElementById('create-room').addEventListener('click', () => {
        const nickname = document.getElementById('nickname').value.trim() || 'Joueur';
        localStorage.setItem('smv2_nickname', nickname);
        nicknameCache = nickname;
        socket.emit('createRoom', { roomId: '', nickname }, (res) => {
            if (!res.ok) { showToast(res.error, 'error'); return; }
            roomId = res.roomId;
            role = res.role;
            applyState(res.state);
            enterGameOnline();
            showToast(`Salle ${roomId} créée. Vous êtes ${role}.`, 'success');
            // Copie automatique du lien
            const url = `${location.origin}${location.pathname}?room=${roomId}`;
            navigator.clipboard.writeText(url).catch(() => { });
        });
    });

    // Rejoindre une salle
    document.getElementById('join-room').addEventListener('click', () => {
        const nickname = document.getElementById('nickname').value.trim() || 'Joueur';
        localStorage.setItem('smv2_nickname', nickname);
        nicknameCache = nickname;
        const rid = (document.getElementById('room-id').value || '').trim().toUpperCase();
        if (!rid) { showToast('Entrez un code de salle.', 'warn'); return; }
        socket.emit('joinRoom', { roomId: rid, nickname }, (res) => {
            if (!res.ok) { showToast(res.error, 'error'); return; }
            roomId = res.roomId;
            role = res.role;
            applyState(res.state);
            enterGameOnline();
            showToast(`Rejoint ${roomId} en ${role}.`, 'success');
        });
    });

    // Copier le lien
    document.getElementById('copy-link').addEventListener('click', async () => {
        if (!roomId) return;
        const url = `${location.origin}${location.pathname}?room=${roomId}`;
        try {
            await navigator.clipboard.writeText(url);
            showToast('Lien copié !', 'success', 1800);
        } catch { showToast('Impossible de copier.', 'warn'); }
    });

    // Pré-remplir depuis l'URL
    const params = new URLSearchParams(location.search);
    const rid = (params.get('room') || '').toUpperCase();
    if (rid) {
        document.getElementById('room-id').value = rid;
        showScreen('lobby');
    }
    if (nicknameCache) document.getElementById('nickname').value = nicknameCache;

    // Pas de reprise automatique: l'utilisateur choisit toujours son mode au menu
    updateRoomsPolling();
}

// ===== LISTE DES SALLES =====
function updateRoomsPolling() {
    if (roomsPollTimer) { clearInterval(roomsPollTimer); roomsPollTimer = null; }
    if (!roomId) {
        roomsPollTimer = setInterval(refreshRoomsList, 5000);
    }
}

function refreshRoomsList() {
    if (!socket || socket.disconnected) return;
    socket.emit('listRooms', {}, (res) => {
        if (res?.ok) renderRoomsList(res.rooms);
    });
}

function renderRoomsList(rooms) {
    const tbody = document.getElementById('rooms-tbody');
    if (!tbody) return;
    if (!rooms || rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-muted)">Aucune salle active</td></tr>';
        return;
    }
    const fmtAgo = (ts) => {
        const d = Date.now() - ts;
        if (d < 60000) return `${Math.round(d / 1000)}s`;
        if (d < 3600000) return `${Math.round(d / 60000)}m`;
        return `${Math.round(d / 3600000)}h`;
    };
    tbody.innerHTML = rooms
        .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
        .map((r) => {
            const badge = r.isFull
                ? '<span class="badge full">Pleine</span>'
                : '<span class="badge open">Ouverte</span>';
            const rem = Math.max(0, (r.lastActivity || 0) + (r.ttlMs || 0) - Date.now());
            return `
            <tr data-room="${r.roomId}" data-last="${r.lastActivity}" data-ttl="${r.ttlMs}">
                <td>${r.roomId}<br>${badge}</td>
                <td>${r.players.X ?? '—'}</td>
                <td>${r.players.O ?? '—'}</td>
                <td>
                    <div style="font-size:0.8em;color:var(--text-muted)">il y a ${fmtAgo(r.lastActivity)}</div>
                    <div style="font-size:0.78em;color:var(--text-muted)">exp. <span class="ttl-cell">${fmtRemain(rem)}</span></div>
                </td>
                <td style="white-space:nowrap">
                    <button class="btn-watch" data-room="${r.roomId}" aria-label="Regarder la salle">
                        <i class="fa-solid fa-eye" aria-hidden="true"></i>
                    </button>
                    <button class="btn-join" data-room="${r.roomId}" ${r.isFull ? 'disabled' : ''}>Rejoindre</button>
                </td>
            </tr>`;
        })
        .join('');

    tbody.querySelectorAll('.btn-watch').forEach((btn) =>
        btn.addEventListener('click', () => watchRoom(btn.dataset.room)));
    tbody.querySelectorAll('.btn-join').forEach((btn) =>
        btn.addEventListener('click', () => joinRoomFromList(btn.dataset.room)));

    startRoomsTtlTicker();
}

function watchRoom(rid) {
    if (!socket) return;
    socket.emit('resumeRoom', { roomId: rid }, (res) => {
        if (!res?.ok) { showToast(res?.error || 'Salle introuvable', 'error'); return; }
        roomId = rid;
        role = res.role || null;
        applyState(res.state);
        enterGameOnline();
        showToast(`Vous regardez la salle ${roomId}.`, 'info');
    });
}

function joinRoomFromList(rid) {
    const nickname = document.getElementById('nickname').value.trim() || 'Joueur';
    localStorage.setItem('smv2_nickname', nickname);
    nicknameCache = nickname;
    socket.emit('joinRoom', { roomId: rid, nickname }, (res) => {
        if (!res.ok) { showToast(res.error, 'error'); return; }
        roomId = res.roomId;
        role = res.role;
        applyState(res.state);
        enterGameOnline();
        showToast(`Rejoint ${roomId} en ${role}.`, 'success');
    });
}

// ===== TOASTS =====
function showToast(message, type = 'info', timeout = 2800) {
    const cont = document.querySelector('.toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    cont.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toast-out 200ms ease-in forwards';
        setTimeout(() => t.remove(), 240);
    }, timeout);
}

// ===== CURSEUR PAIR =====
function sendCursor(i, j) {
    if (!roomId || !socket || socket.disconnected || localMode) return;
    const now = Date.now();
    if (now - cursorThrottle < 50) return;
    cursorThrottle = now;
    socket.emit('cursorMove', { roomId, bigIndex: i, smallIndex: j });
}

function clearPeerCursor() {
    if (lastPeer.i == null) return;
    smallCellsMatrix[lastPeer.i]?.[lastPeer.j]?.classList.remove('peer-hover');
    lastPeer = { i: null, j: null };
}

function highlightPeerCursor(i, j) {
    clearPeerCursor();
    const el = smallCellsMatrix[i]?.[j];
    if (el) { el.classList.add('peer-hover'); lastPeer = { i, j }; }
}

// ===== TTL =====
function fmtRemain(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function startRoomTtlCountdown(el, lastActivity, ttlMs) {
    if (roomTtlTimer) clearInterval(roomTtlTimer);
    const tick = () => {
        el.textContent = fmtRemain(Math.max(0, (lastActivity || 0) + (ttlMs || 0) - Date.now()));
    };
    tick();
    roomTtlTimer = setInterval(tick, 1000);
}

function startRoomsTtlTicker() {
    if (roomsTtlTimer) clearInterval(roomsTtlTimer);
    const tick = () => {
        document.querySelectorAll('#rooms-tbody tr[data-room]').forEach(row => {
            const rem = Math.max(0,
                parseInt(row.dataset.last || '0', 10) +
                parseInt(row.dataset.ttl || '0', 10) -
                Date.now());
            const cell = row.querySelector('.ttl-cell');
            if (cell) cell.textContent = fmtRemain(rem);
        });
    };
    tick();
    roomsTtlTimer = setInterval(tick, 1000);
}

// ===== INIT =====
function init() {
    rebuildMatricesAndListeners();
    connectSocket();
    setupUi();
    // Afficher le menu sauf si URL avec ?room= (géré dans setupUi)
    const hasRoom = new URLSearchParams(location.search).get('room');
    if (!hasRoom) showScreen('menu');
    // Tutoriel automatique à la première visite
    if (!localStorage.getItem('smv2_seen_tutorial')) {
        setTimeout(showTutorial, 500);
    }
}

init();
