import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contracts/GameRunner';

export default function GameContainer() {
    const gameRef = useRef(null);

    // --- Состояния Web3 ---
    const [account, setAccount] = useState('');
    const [userBalance, setUserBalance] = useState('0');
    const [contractBalance, setContractBalance] = useState('0');
    const [entryFee, setEntryFee] = useState('0.001');
    const [ladderPool, setLadderPool] = useState('0');
    const [isOwner, setIsOwner] = useState(false);
    const [blockchainLeaderboard, setBlockchainLeaderboard] = useState([]);

    // Настройки панели админа
    const [newFeeInput, setNewFeeInput] = useState('');
    const [newPoolInput, setNewPoolInput] = useState('');
    const [statusText, setStatusText] = useState('');
    const [loading, setLoading] = useState(false);

    // --- Состояния UI игры ---
    const [gameState, setGameState] = useState('menu'); // 'menu', 'playing', 'gameover'
    const [activeTab, setActiveTab] = useState('rules'); // 'rules', 'characters', 'leaderboard', 'admin'
    const [score, setScore] = useState(0);

    // Персонажи (внутренняя кастомизация)
    const [selectedChar, setSelectedChar] = useState(() => localStorage.getItem('temple_char') || 'green');
    const characters = {
        green: { name: 'Кадет', color: 0x10b981, desc: 'Сбалансированный классический куб', textColor: 'text-emerald-400' },
        blue: { name: 'Акробат', color: 0x06b6d4, desc: 'Легче контролировать в воздухе', textColor: 'text-cyan-400' },
        yellow: { name: 'Скороход', color: 0xf59e0b, desc: 'Быстрее реагирует на повороты', textColor: 'text-amber-400' }
    };

    // Улучшения (из localStorage)
    const [upgrades] = useState(() => {
        const saved = localStorage.getItem('temple_upgrades');
        return saved ? JSON.parse(saved) : { jump: 0, slide: 0, reaction: 0 };
    });

    // --- РЕАЛЬНЫЕ WEB3 ФУНКЦИИ (Ethers.js v6) ---

    // 1. Подключение к MetaMask
    const connectWallet = async () => {
        if (!window.ethereum) return alert('Установите MetaMask!');
        try {
            setLoading(true);
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const targetChainId = '0x1691'; // 5777 в hex для Ganache GUI

            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: targetChainId }],
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: targetChainId,
                                chainName: 'Ganache Local',
                                rpcUrls: ['http://127.0.0.1:7545'],
                                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
                            }],
                        });
                    } catch (addError) {
                        console.error("Не удалось добавить сеть Ganache", addError);
                    }
                }
            }

            setAccount(accounts[0]);
            await loadContractData(accounts[0]);
        } catch (err) {
            console.error("Ошибка при подключении кошелька:", err);
        } finally {
            setLoading(false);
        }
    };

    const disconnectWallet = () => {
        setAccount('');
        setIsOwner(false);
    };

    // 2. Загрузка данных из контракта и сети
    const loadContractData = async (userAddr) => {
        if (!window.ethereum || !userAddr) return;
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);

            // Получаем баланс пользователя
            const balWei = await provider.getBalance(userAddr);
            setUserBalance(Number(ethers.formatEther(balWei)).toFixed(4));

            // Баланс самого смарт-контракта
            const contractBalWei = await provider.getBalance(CONTRACT_ADDRESS);
            setContractBalance(Number(ethers.formatEther(contractBalWei)).toFixed(4));

            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

            // Читаем стоимость входа
            const feeWei = await contract.entryFee();
            setEntryFee(ethers.formatEther(feeWei));

            // Проверяем, является ли пользователь владельцем (owner)
            try {
                const ownerAddress = await contract.owner();
                setIsOwner(ownerAddress.toLowerCase() === userAddr.toLowerCase());
            } catch (e) {
                console.log("Не удалось прочитать владельца контракта (возможно, нет такой переменной)");
            }

            // Получаем таблицу лидеров
            try {
                const leaders = await contract.getLeaderboard();
                const formattedLeaders = leaders.map(leader => ({
                    player: `${leader.player.slice(0, 6)}...${leader.player.slice(-4)}`,
                    score: Number(leader.score)
                }));
                setBlockchainLeaderboard(formattedLeaders);
            } catch (e) {
                console.error("Ошибка чтения лидерборда:", e);
            }

        } catch (err) {
            console.error("Ошибка при загрузке данных:", err);
        }
    };

    // 3. Старт игры с реальной оплатой в ETH
    const handleStartGameContract = async () => {
        if (!account) return alert('Сначала подключите кошелек!');
        setLoading(true);
        setStatusText('Ожидание оплаты в кошельке...');

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const feeWei = ethers.parseEther(entryFee);

            // Вызываем startGame() контракта и прикрепляем плату за вход (value)
            const tx = await contract.startGame({ value: feeWei });

            setStatusText('Оплата отправлена в блокчейн. Ждем подтверждения...');
            await tx.wait(); // Ждём майнинга транзакции

            setStatusText('Игра оплачена! Пора бежать!');
            setGameState('playing'); // Переключаем экран на Phaser игру!
        } catch (err) {
            console.error("Ошибка при оплате игры:", err);
            alert("Транзакция оплаты отклонена или произошла ошибка.");
            setStatusText('');
        } finally {
            setLoading(false);
        }
    };

    // 4. Ручная отправка рекорда в блокчейн
    const handleClaimRewardContract = async (finalScore) => {
        if (!account) return;
        setLoading(true);
        setStatusText('Запись результата в блокчейн...');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const tx = await contract.claimReward(finalScore);

            setStatusText('Транзакция в обработке. Фиксируем рекорд...');
            await tx.wait();

            if (finalScore > 100) {
                alert(`Поздравляем! Вы набрали ${finalScore} очков и забрали двойную награду!`);
            } else {
                alert(` Отлично! Ваш результат в ${finalScore} очков сохранен в лидерборде!`);
            }

            await loadContractData(account);
            setGameState('menu');
        } catch (err) {
            console.error("Не удалось зафиксировать результат в блокчейне:", err);
            alert("Ошибка при записи рекорда в блокчейн. Возможно, транзакция отменена.");
        } finally {
            setStatusText('');
            setLoading(false);
        }
    };

    // --- РЕАЛЬНЫЕ АДМИН-ФУНКЦИИ СМАРТ-КОНТРАКТА ---

    // Смена цены входа
    const handleUpdateFeeContract = async () => {
        const val = parseFloat(newFeeInput);
        if (isNaN(val) || val <= 0) return alert('Введите корректное число');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const tx = await contract.setEntryFee(ethers.parseEther(newFeeInput));
            await tx.wait();
            alert('Цена входа успешно обновлена на контракте!');
            setNewFeeInput('');
            loadContractData(account);
        } catch (e) {
            console.error(e);
            alert('Ошибка при изменении стоимости');
        }
    };

    // Вывод средств владельцу
    const handleWithdrawContract = async () => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const tx = await contract.withdraw();
            await tx.wait();
            alert('Все накопленные средства успешно выведены на ваш кошелек!');
            loadContractData(account);
        } catch (e) {
            console.error(e);
            alert('Ошибка вывода средств');
        }
    };

    // Периодическое обновление данных при изменении аккаунта
    useEffect(() => {
        if (account) {
            loadContractData(account);
        }
    }, [account]);


    // --- Логика Phaser ---
    useEffect(() => {
        if (gameState !== 'playing') {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
            return;
        }

        const jumpDuration = 250 + upgrades.jump * 25;
        const slideDuration = 500 + upgrades.slide * 40;
        const turnLimit = 1200 + upgrades.reaction * 150;
        const charColor = characters[selectedChar].color;

        const config = {
            type: Phaser.AUTO,
            width: 500,
            height: 500,
            parent: 'phaser-game-container',
            physics: {
                default: 'arcade',
                arcade: { gravity: { y: 0 }, debug: false }
            },
            scene: { preload, create, update }
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        let player;
        let obstacles;
        let speedLines;
        let cursors;
        let keyA, keyD, keyW, keyS;
        let currentScore = 0;
        let scoreText;
        let spawnTimer;
        let speedLineTimer;

        const lanes = [150, 250, 350];
        let currentLane = 1;
        let playerState = 'running';
        let slideTimer = null;
        let activeTurn = null;
        let turnIndicator = null;
        let turnTimeout = null;

        function preload() {}

        function create() {
            const scene = this;
            currentScore = 0;
            activeTurn = null;

            scene.add.rectangle(250, 250, 300, 500, 0x111827);
            scene.add.line(0, 0, 200, 0, 200, 500, 0x1f2937).setOrigin(0);
            scene.add.line(0, 0, 300, 0, 300, 500, 0x1f2937).setOrigin(0);

            speedLines = scene.add.group();

            player = scene.add.rectangle(lanes[currentLane], 400, 36, 36, charColor);
            scene.physics.add.existing(player);
            player.depth = 10;

            obstacles = scene.physics.add.group();

            scoreText = scene.add.text(20, 20, 'SCORE: 0', {
                fontSize: '18px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fill: '#f3f4f6'
            });

            cursors = scene.input.keyboard.createCursorKeys();
            keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);

            spawnTimer = scene.time.addEvent({
                delay: 1300,
                callback: spawnEvent,
                callbackScope: scene,
                loop: true
            });

            speedLineTimer = scene.time.addEvent({
                delay: 150,
                callback: spawnSpeedLine,
                callbackScope: scene,
                loop: true
            });

            scene.physics.add.overlap(player, obstacles, handleCollision, null, scene);
        }

        function update() {
            const scene = this;
            const currentSpeed = 300 + currentScore * 5;

            speedLines.getChildren().forEach(line => {
                line.y += currentSpeed * (scene.sys.game.loop.delta / 1000);
                if (line.y > 550) line.destroy();
            });

            if (activeTurn) {
                if (activeTurn === 'left' && (Phaser.Input.Keyboard.JustDown(cursors.left) || Phaser.Input.Keyboard.JustDown(keyA))) {
                    triggerCameraTurn(scene, -90);
                    return;
                }
                if (activeTurn === 'right' && (Phaser.Input.Keyboard.JustDown(cursors.right) || Phaser.Input.Keyboard.JustDown(keyD))) {
                    triggerCameraTurn(scene, 90);
                    return;
                }
            }

            if (!activeTurn) {
                if (Phaser.Input.Keyboard.JustDown(cursors.left) || Phaser.Input.Keyboard.JustDown(keyA)) {
                    if (currentLane > 0) {
                        currentLane--;
                        player.x = lanes[currentLane];
                        createGhostEffect(scene, player.x + 30, player.y);
                    }
                }
                if (Phaser.Input.Keyboard.JustDown(cursors.right) || Phaser.Input.Keyboard.JustDown(keyD)) {
                    if (currentLane < 2) {
                        currentLane++;
                        player.x = lanes[currentLane];
                        createGhostEffect(scene, player.x - 30, player.y);
                    }
                }
            }

            if ((Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(cursors.space) || Phaser.Input.Keyboard.JustDown(keyW)) && playerState === 'running') {
                playerState = 'jumping';
                player.setFillStyle(0x38bdf8);
                scene.tweens.add({
                    targets: player,
                    scaleX: 0.6,
                    scaleY: 1.8,
                    duration: jumpDuration,
                    yoyo: true,
                    onComplete: () => {
                        playerState = 'running';
                        player.setScale(1);
                        player.setFillStyle(charColor);
                    }
                });
            }

            if ((Phaser.Input.Keyboard.JustDown(cursors.down) || Phaser.Input.Keyboard.JustDown(keyS)) && playerState === 'running') {
                playerState = 'sliding';
                player.setFillStyle(0x64748b);
                player.scaleX = 1.6;
                player.scaleY = 0.3;

                if (slideTimer) slideTimer.destroy();
                slideTimer = scene.time.delayedCall(slideDuration, () => {
                    if (playerState === 'sliding') {
                        playerState = 'running';
                        player.setScale(1);
                        player.setFillStyle(charColor);
                    }
                });
            }

            obstacles.getChildren().forEach((obs) => {
                if (obs.y > 550) {
                    obs.destroy();
                    currentScore += 1;
                    scoreText.setText('SCORE: ' + currentScore);
                }
            });
        }

        function spawnSpeedLine() {
            const scene = this;
            const x = Phaser.Math.Between(110, 390);
            const length = Phaser.Math.Between(15, 40);
            const line = scene.add.rectangle(x, -20, 2, length, 0xffffff, 0.1);
            speedLines.add(line);
        }

        function createGhostEffect(scene, x, y) {
            const ghost = scene.add.rectangle(x, y, player.width, player.height, player.fillColor, 0.3);
            ghost.setScale(player.scaleX, player.scaleY);
            scene.tweens.add({
                targets: ghost,
                alpha: 0,
                scaleX: 0.2,
                scaleY: 0.2,
                duration: 200,
                onComplete: () => ghost.destroy()
            });
        }

        function triggerCameraTurn(scene, angle) {
            activeTurn = null;
            if (turnIndicator) turnIndicator.destroy();
            if (turnTimeout) turnTimeout.remove();

            currentScore += 5;
            scoreText.setText('SCORE: ' + currentScore);

            scene.cameras.main.flash(150, 250, 204, 21);
            scene.cameras.main.rotateTo(angle * (Math.PI / 180), true, 250, 'Quad.easeOut');

            scene.time.delayedCall(300, () => {
                scene.cameras.main.setRotation(0);
                obstacles.clear(true, true);
            });
        }

        function createObstacleObject(scene, lane, type) {
            let obs;
            if (type === 'low') {
                obs = scene.add.rectangle(lane, -50, 36, 36, 0x475569);
                obs.setData('type', 'low');
            } else if (type === 'high') {
                obs = scene.add.rectangle(lane, -50, 80, 4, 0x22c55e);
                obs.setData('type', 'high');
            } else if (type === 'pit') {
                obs = scene.add.rectangle(lane, -50, 80, 80, 0x000000);
                obs.setData('type', 'pit');
            }

            if (obs) {
                scene.physics.add.existing(obs);
                obstacles.add(obs);
                obs.body.setVelocityY(300 + currentScore * 5);
            }
        }

        function spawnEvent() {
            const scene = this;
            if (activeTurn) return;

            const rand = Phaser.Math.Between(0, 100);
            if (rand < 12 && currentScore > 5) {
                spawnTurnSection(scene);
            } else if (rand >= 12 && rand < 42 && currentScore > 3) {
                spawnPatternObstacles(scene);
            } else {
                const randomLane = Phaser.Math.RND.pick(lanes);
                const types = ['low', 'high', 'pit'];
                const randomType = Phaser.Math.RND.pick(types);
                createObstacleObject(scene, randomLane, randomType);
            }
        }

        function spawnPatternObstacles(scene) {
            const patternType = Phaser.Math.Between(0, 4);
            switch (patternType) {
                case 0:
                    createObstacleObject(scene, lanes[0], 'pit');
                    createObstacleObject(scene, lanes[1], 'high');
                    createObstacleObject(scene, lanes[2], 'low');
                    break;
                case 1:
                    if (Phaser.Math.Between(0, 1) === 0) {
                        createObstacleObject(scene, lanes[1], 'low');
                        createObstacleObject(scene, lanes[2], 'pit');
                    } else {
                        createObstacleObject(scene, lanes[0], 'high');
                        createObstacleObject(scene, lanes[1], 'low');
                    }
                    break;
                case 2:
                    createObstacleObject(scene, lanes[0], 'high');
                    createObstacleObject(scene, lanes[1], 'high');
                    createObstacleObject(scene, lanes[2], 'high');
                    break;
                case 3:
                    createObstacleObject(scene, lanes[0], 'low');
                    createObstacleObject(scene, lanes[1], 'pit');
                    createObstacleObject(scene, lanes[2], 'low');
                    break;
                case 4:
                    if (Phaser.Math.Between(0, 1) === 0) {
                        createObstacleObject(scene, lanes[0], 'high');
                        createObstacleObject(scene, lanes[2], 'high');
                    } else {
                        createObstacleObject(scene, lanes[0], 'pit');
                        createObstacleObject(scene, lanes[2], 'pit');
                    }
                    break;
            }
        }

        function spawnTurnSection(scene) {
            const turnType = Phaser.Math.Between(0, 1) === 0 ? 'left' : 'right';
            activeTurn = turnType;
            const arrowX = 250;
            const arrowY = 150;

            turnIndicator = scene.add.text(arrowX, arrowY, turnType === 'left' ? '◀◀ TURN LEFT' : 'TURN RIGHT ▶▶', {
                fontSize: '28px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fill: '#fbbf24',
                backgroundColor: '#000000dd'
            }).setOrigin(0.5);

            scene.tweens.add({
                targets: turnIndicator,
                alpha: 0.3,
                duration: 200,
                yoyo: true,
                loop: -1
            });

            turnTimeout = scene.time.delayedCall(turnLimit, () => {
                if (activeTurn) gameOverByMissedTurn(scene);
            });
        }

        function gameOverByMissedTurn(scene) {
            scene.cameras.main.shake(200, 0.04);
            scene.physics.pause();
            spawnTimer.destroy();
            speedLineTimer.destroy();
            if (turnIndicator) turnIndicator.destroy();
            player.setFillStyle(0xef4444);
            scene.time.delayedCall(1000, () => {
                setScore(currentScore);
                setGameState('gameover');
                // Больше нет автовызова MetaMask!
            });
        }

        function handleCollision(playerObj, obstacleObj) {
            const scene = this;
            const obsType = obstacleObj.getData('type');

            if (obsType === 'low' && playerState === 'jumping') return;
            if (obsType === 'pit' && playerState === 'jumping') return;
            if (obsType === 'high' && playerState === 'sliding') return;

            scene.cameras.main.shake(250, 0.05);
            scene.physics.pause();
            spawnTimer.destroy();
            speedLineTimer.destroy();
            if (turnTimeout) turnTimeout.remove();

            if (player.setFillStyle) {
                player.setScale(1);
                player.setFillStyle(0xef4444);
            }
            scene.time.delayedCall(1000, () => {
                setScore(currentScore);
                setGameState('gameover');
                // Больше нет автовызова MetaMask!
            });
        }

        return () => { game.destroy(true); };
    }, [gameState, selectedChar, upgrades]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[620px] w-full max-w-xl mx-auto p-4 bg-slate-950 rounded-3xl border border-slate-900 text-slate-100 shadow-2xl overflow-hidden relative">

            {/* 🌐 РЕАЛЬНАЯ ВЕБ3 ПАНЕЛЬ БАЛАНСОВ */}
            <div className="w-full flex justify-between items-center mb-4 px-2">
                <div className="flex flex-col text-left">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Мой Кошелёк</span>
                    <span className="font-mono text-xs text-sky-400 font-bold">
                        {account ? `${account.slice(0, 6)}...${account.slice(-4)} (${userBalance} ETH)` : 'Не подключен'}
                    </span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Баланс Игры</span>
                    <span className="font-mono text-xs text-yellow-500 font-bold">
                        💎 {contractBalance} ETH
                    </span>
                </div>
            </div>

            {/* КНОПКА ПОДКЛЮЧЕНИЯ */}
            {!account ? (
                <div className="w-full mb-4">
                    <button
                        onClick={connectWallet}
                        disabled={loading}
                        className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-slate-950 font-black rounded-xl font-mono text-xs tracking-wider"
                    >
                        {loading ? 'ПОДКЛЮЧЕНИЕ...' : 'ПОДКЛЮЧИТЬ METAMASK'}
                    </button>
                </div>
            ) : (
                <div className="w-full flex gap-2 mb-4">
                    <span className="flex-1 py-1.5 text-center text-emerald-400 font-mono text-xs font-bold bg-slate-900/40 rounded-lg border border-slate-900">
                        🟢 Сеть Ganache подключена
                    </span>
                    <button
                        onClick={disconnectWallet}
                        className="py-1.5 px-3 bg-red-950 hover:bg-red-900 text-red-300 font-mono text-xs font-bold rounded-lg"
                    >
                        Выйти
                    </button>
                </div>
            )}

            {/* СТАТУС ВЕБ3 ОПЕРАЦИЙ */}
            {statusText && (
                <div className="w-full text-center py-2 px-3 mb-4 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-yellow-400 font-mono animate-pulse">
                    {statusText}
                </div>
            )}

            {/* 🎮 1. ГЛАВНОЕ МЕНЮ */}
            {gameState === 'menu' && account && (
                <div className="w-full flex flex-col items-center space-y-5 animate-fade-in">

                    <div className="text-center">
                        <h1 className="text-4xl font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-500 font-mono">
                            CUBE RUNNER
                        </h1>
                        <p className="text-xs text-slate-500 font-mono">Real Web3 Ganache Edition</p>
                    </div>

                    {/* НАВИГАЦИЯ */}
                    <div className="w-full grid grid-cols-4 gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-900">
                        {[
                            { id: 'rules', label: 'Инфо' },
                            { id: 'characters', label: 'Скины' },
                            { id: 'leaderboard', label: 'Ладер' },
                            { id: 'admin', label: 'Админ', hide: !isOwner }
                        ].map(tab => {
                            if (tab.hide) return null;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`py-2 text-[10px] font-bold font-mono rounded-lg transition-all ${
                                        activeTab === tab.id
                                            ? 'bg-slate-800 text-sky-400 border border-slate-700'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ВКЛАДКА ИНФО */}
                    {activeTab === 'rules' && (
                        <div className="w-full text-xs text-slate-400 font-mono space-y-2 bg-slate-900/20 p-4 rounded-2xl border border-slate-900/60 animate-fade-in">
                            <p className="text-slate-300 font-bold uppercase text-center mb-1">Управление:</p>
                            <div className="space-y-1.5">
                                <p>• <span className="text-sky-400">Препятствия</span> — Прыжок (W / SPACE / ↑) или Подкат (S / ↓)</p>
                                <p>• <span className="text-yellow-500">Стрелка поворота</span> — Повернуть в нужный момент (A или D)</p>
                            </div>
                            <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-500 leading-relaxed">
                                * Стоимость старта: <span className="text-yellow-400 font-bold">{entryFee} ETH</span>.
                                <br />* Наберите **более 100 очков**, чтобы вернуть ставку в двойном размере!
                            </div>
                        </div>
                    )}

                    {/* ВКЛАДКА СКИНОУ */}
                    {activeTab === 'characters' && (
                        <div className="w-full space-y-3 animate-fade-in">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono">Выбери куб:</h2>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.entries(characters).map(([key, char]) => (
                                    <button
                                        key={key}
                                        onClick={() => {
                                            setSelectedChar(key);
                                            localStorage.setItem('temple_char', key);
                                        }}
                                        className={`flex flex-col items-center p-3 rounded-2xl border transition-all ${
                                            selectedChar === key
                                                ? 'bg-slate-950 border-sky-500 shadow-lg shadow-sky-500/10'
                                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        <div
                                            className="w-8 h-8 rounded-lg mb-2"
                                            style={{ backgroundColor: `#${char.color.toString(16)}` }}
                                        />
                                        <span className={`text-[12px] font-bold font-mono ${char.textColor}`}>{char.name}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-center text-xs text-slate-400 italic font-mono h-4">
                                {characters[selectedChar].desc}
                            </p>
                        </div>
                    )}

                    {/* ВКЛАДКА ТАБЛИЦЫ ЛИДЕРОВ */}
                    {activeTab === 'leaderboard' && (
                        <div className="w-full bg-slate-900/40 p-4 rounded-2xl border border-slate-900 space-y-3 font-mono animate-fade-in text-xs">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Блокчейн Лидерборд</h2>
                            </div>
                            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                                {blockchainLeaderboard.length === 0 ? (
                                    <p className="text-slate-500 text-center py-4">Лидерборд пуст</p>
                                ) : (
                                    blockchainLeaderboard.map((item, index) => (
                                        <div key={index} className="flex justify-between items-center py-1 border-b border-slate-900">
                                            <span className="text-slate-300">{index + 1}. {item.player}</span>
                                            <span className="text-yellow-400 font-bold">{item.score} очк.</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* ВКЛАДКА АДМИНА */}
                    {activeTab === 'admin' && isOwner && (
                        <div className="w-full bg-slate-900/40 p-4 rounded-2xl border border-slate-900 space-y-4 font-mono animate-fade-in text-xs">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-red-400">Управление Контрактом</h2>
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Новая цена (ETH)"
                                        value={newFeeInput}
                                        onChange={e => setNewFeeInput(e.target.value)}
                                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                                    />
                                    <button onClick={handleUpdateFeeContract} className="bg-sky-600 hover:bg-sky-500 text-slate-950 px-4 rounded-lg font-bold">
                                        Обновить
                                    </button>
                                </div>
                                <button onClick={handleWithdrawContract} className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold">
                                    Вывести все ETH с контракта
                                </button>
                            </div>
                        </div>
                    )}

                    {/* КНОПКА ЗАПУСКА ИГРЫ */}
                    <button
                        onClick={handleStartGameContract}
                        disabled={loading}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl font-mono text-sm tracking-widest shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
                    >
                        {loading ? 'ПОДГОТОВКА...' : `ИГРАТЬ ЗА ${entryFee} ETH`}
                    </button>
                </div>
            )}

            {/* 🎮 2. ЭКРАН ИГРЫ PHASER */}
            {gameState === 'playing' && (
                <div className="w-full flex flex-col items-center animate-fade-in">
                    <div id="phaser-game-container" className="rounded-2xl overflow-hidden border border-slate-800" />
                    <p className="text-[10px] text-slate-500 font-mono mt-3">
                        Используйте W/A/S/D или Стрелочки для управления кубом
                    </p>
                </div>
            )}

            {/* 💀 3. ЭКРАН GAME OVER */}
            {gameState === 'gameover' && (
                <div className="w-full flex flex-col items-center py-6 space-y-6 animate-fade-in text-center font-mono">
                    <div className="space-y-1">
                        <div className="text-red-500 text-5xl font-black tracking-widest uppercase">
                            CRASHED!
                        </div>
                        <p className="text-xs text-slate-400">Забег завершен</p>
                    </div>

                    <div className="w-full max-w-sm bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Счет в забеге:</span>
                            <span className="text-2xl font-bold text-white">{score}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Выигрыш:</span>
                            <span className="text-lg font-bold text-emerald-400">
                                {score > 100 ? `+ ${Number(entryFee) * 2} ETH` : '0 ETH (нужно > 100)'}
                            </span>
                        </div>
                    </div>

                    <div className="w-full flex flex-col gap-2">
                        {/* Кнопка ручной отправки рекорда (если набрано > 5 очков) */}
                        {score > 5 ? (
                            <button
                                onClick={() => handleClaimRewardContract(score)}
                                disabled={loading}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-sm font-black rounded-xl tracking-wider active:scale-95 transition-all"
                            >
                                {loading ? 'ЗАПИСЬ...' : '🏆 ЗАПИСАТЬ РЕКОРД В BLOCKCHAIN'}
                            </button>
                        ) : (
                            <div className="text-[10px] text-slate-500 py-1">
                                Наберите больше 5 очков, чтобы записать рекорд в блокчейн
                            </div>
                        )}

                        <button
                            onClick={() => setGameState('menu')}
                            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold border border-slate-800 rounded-xl tracking-wider active:scale-95 transition-all"
                        >
                            ВЕРНУТЬСЯ В МЕНЮ
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}