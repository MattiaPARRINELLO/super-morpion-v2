document.addEventListener("DOMContentLoaded", function () {
    const container = document.createElement('div');
    container.classList.add('container');

    container.innerHTML = `
        <header>
            <span class="logo">Super Morpion</span>
            <div class="header-actions">
                <button id="btn-help" class="btn-icon" title="Comment jouer" aria-label="Comment jouer">
                    <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                </button>
                <button id="toggle-theme" class="btn-icon" title="Changer le thème" aria-label="Changer le thème">
                    <i class="fa-solid fa-moon" aria-hidden="true"></i>
                </button>
            </div>
        </header>

        <!-- Écran 1 : sélection du mode -->
        <div id="screen-menu">
            <p class="hero-subtitle">Morpion Ultime · Choisis ton mode</p>
            <div class="mode-cards">
                <button class="mode-card" id="btn-local">
                    <span class="mode-icon"><i class="fa-solid fa-gamepad" aria-hidden="true"></i></span>
                    <strong>En local</strong>
                    <span class="mode-desc">Deux joueurs sur le même écran</span>
                </button>
                <button class="mode-card" id="btn-ai">
                    <span class="mode-icon"><i class="fa-solid fa-robot" aria-hidden="true"></i></span>
                    <strong>Contre l'IA</strong>
                    <span class="mode-desc">Défie l'ordinateur</span>
                </button>
                <button class="mode-card" id="btn-online">
                    <span class="mode-icon"><i class="fa-solid fa-globe" aria-hidden="true"></i></span>
                    <strong>En ligne</strong>
                    <span class="mode-desc">Crée ou rejoins une salle</span>
                </button>
            </div>
            <button id="btn-show-tutorial" class="btn-link">
                <i class="fa-solid fa-book-open" aria-hidden="true"></i>
                <span>Comment jouer ?</span>
            </button>
        </div>

        <!-- Écran 2 : lobby en ligne -->
        <div id="screen-lobby" class="hidden">
            <button class="btn-back" id="btn-back-lobby">
                <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                <span>Menu</span>
            </button>
            <div class="lobby-grid">
                <div class="lobby-form-card">
                    <h2>Jouer en ligne</h2>
                    <div class="form-group">
                        <label for="nickname">Pseudo</label>
                        <input id="nickname" type="text" placeholder="Ton pseudo" maxlength="20" autocomplete="off" />
                    </div>
                    <button id="create-room" class="btn-primary btn-full">
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                        <span>Créer une salle</span>
                    </button>
                    <div class="divider-or"><span>ou rejoindre</span></div>
                    <div class="join-row">
                        <input id="room-id" type="text" placeholder="Code de salle" maxlength="10" autocomplete="off" />
                        <button id="join-room" class="btn-secondary">
                            <span>Rejoindre</span>
                            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                        </button>
                    </div>
                    <p id="connection-status" class="status-text">Connexion…</p>
                </div>
                <div class="rooms-panel">
                    <h3>Salles actives</h3>
                    <div class="rooms-scroll">
                        <table class="rooms-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th><i class="fa-solid fa-xmark" aria-hidden="true"></i></th>
                                    <th><i class="fa-regular fa-circle" aria-hidden="true"></i></th>
                                    <th>Activité</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="rooms-tbody">
                                <tr><td colspan="5">Chargement…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Écran 3 : jeu -->
        <div id="screen-game" class="hidden">
            <div class="game-topbar">
                <button class="btn-back" id="btn-back-game">
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                    <span>Menu</span>
                </button>
                <div class="room-badge hidden" id="room-badge">
                    <span>Salle: <strong id="ui-room">—</strong></span>
                    <button class="btn-icon-sm" id="copy-link" title="Copier le lien" aria-label="Copier le lien">
                        <i class="fa-solid fa-link" aria-hidden="true"></i>
                    </button>
                    <span class="ttl-info hidden" id="ttl-info">· Exp. <strong id="ui-ttl">—</strong></span>
                </div>
            </div>
            <div class="scoreboard">
                <div class="score-block score-x-side" id="score-block-x">
                    <span class="score-piece"><i class="fa-solid fa-xmark" aria-hidden="true"></i></span>
                    <span class="score-name" id="player-x-name">Joueur X</span>
                    <span class="score-num" id="score-x">0</span>
                </div>
                <div class="turn-block">
                    <div class="turn-label">Tour</div>
                    <div class="turn-value" id="turn"><i class="fa-solid fa-xmark" aria-hidden="true"></i></div>
                </div>
                <div class="score-block score-right score-o-side" id="score-block-o">
                    <span class="score-num" id="score-o">0</span>
                    <span class="score-name" id="player-o-name">Joueur O</span>
                    <span class="score-piece"><i class="fa-regular fa-circle" aria-hidden="true"></i></span>
                </div>
            </div>
            <div class="game">
                <div class="board"></div>
            </div>
            <div id="room-info-bar" class="hidden">
                Adversaire : <strong id="ui-opponent">—</strong>
            </div>
        </div>

        <!-- Overlay de configuration IA -->
        <div id="ai-config-overlay" class="hidden">
            <div class="modal-backdrop"></div>
            <div class="config-modal">
                <div class="config-header">
                    <span class="config-icon"><i class="fa-solid fa-robot" aria-hidden="true"></i></span>
                    <h2>Partie contre l'IA</h2>
                </div>
                <div class="config-group">
                    <label>Difficulté</label>
                    <div class="btn-group" id="ai-difficulty">
                        <button class="pill-btn" data-value="easy"><i class="fa-solid fa-seedling" aria-hidden="true"></i> Facile</button>
                        <button class="pill-btn active" data-value="medium"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Moyen</button>
                        <button class="pill-btn" data-value="hard"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Difficile</button>
                        <button class="pill-btn ultra" data-value="ultra"><i class="fa-solid fa-skull" aria-hidden="true"></i> Ultra</button>
                    </div>
                </div>
                <div class="config-group">
                    <label>Ton symbole</label>
                    <div class="btn-group" id="ai-side">
                        <button class="pill-btn active" data-value="X"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Je commence</button>
                        <button class="pill-btn" data-value="O"><i class="fa-regular fa-circle" aria-hidden="true"></i> IA commence</button>
                    </div>
                </div>
                <div class="config-actions">
                    <button id="ai-cancel" class="btn-back">Annuler</button>
                    <button id="ai-start" class="btn-primary btn-lg">Jouer !</button>
                </div>
            </div>
        </div>

        <!-- Overlay du tutoriel interactif -->
        <div id="tutorial-overlay" class="hidden">
            <div class="modal-backdrop"></div>
            <div class="tutorial-modal tutorial-interactive">
                <button class="modal-close" id="tutorial-x" title="Fermer" aria-label="Fermer">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
                <div class="tut-header">
                    <span class="tut-badge" id="tut-step-badge">1 / 7</span>
                    <h2 class="tut-title" id="tut-title">—</h2>
                </div>
                <div class="tut-layout">
                    <div class="tut-board-side">
                        <div class="board tut-board" id="tut-board"></div>
                    </div>
                    <div class="tut-text-side">
                        <p class="tut-explanation" id="tut-explanation">—</p>
                        <div class="tut-legend" id="tut-legend"></div>
                    </div>
                </div>
                <div class="tut-footer">
                    <div class="tut-dots" id="tut-dots"></div>
                    <div class="tut-nav">
                        <button id="tut-prev" class="btn-back tut-prev-btn">← Retour</button>
                        <button id="tut-next" class="btn-primary">Suivant →</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Overlay de victoire / nul -->
        <div id="win-overlay" class="hidden">
            <div class="win-backdrop"></div>
            <div class="win-modal">
                <div class="win-big-emoji" id="win-emoji"><i class="fa-solid fa-trophy" aria-hidden="true"></i></div>
                <h2 id="win-title">Victoire !</h2>
                <p id="win-subtitle">a gagné la partie !</p>
                <div class="win-score-recap">
                    <div class="win-score-item">
                        <span><i class="fa-solid fa-xmark" aria-hidden="true"></i></span>
                        <strong id="win-score-x">0</strong>
                    </div>
                    <span class="win-vs">—</span>
                    <div class="win-score-item">
                        <strong id="win-score-o">0</strong>
                        <span><i class="fa-regular fa-circle" aria-hidden="true"></i></span>
                    </div>
                </div>
                <button id="win-continue" class="btn-primary btn-lg">Nouvelle partie</button>
            </div>
        </div>

        <!-- Toasts -->
        <div class="toast-container"></div>
    `;

    // Générer les cellules du plateau
    const board = container.querySelector('.board');
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        const smallBoard = document.createElement('div');
        smallBoard.classList.add('small-board');
        for (let j = 0; j < 9; j++) {
            const smallCell = document.createElement('div');
            smallCell.classList.add('cell');
            smallBoard.appendChild(smallCell);
        }
        cell.appendChild(smallBoard);
        board.appendChild(cell);
    }

    document.body.appendChild(container);

    // Thème persistant
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.body.classList.add('dark-mode');

    const toggleThemeButton = document.getElementById('toggle-theme');
    const setThemeIcon = (isDark) => {
        toggleThemeButton.innerHTML = isDark
            ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
    };

    toggleThemeButton.addEventListener('click', function () {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        setThemeIcon(isDark);
    });
    // Icône initiale
    setThemeIcon(savedTheme === 'dark');

    // Charger script.js après que le DOM soit prêt
    const script = document.createElement('script');
    script.src = 'script.js';
    document.body.appendChild(script);
});
