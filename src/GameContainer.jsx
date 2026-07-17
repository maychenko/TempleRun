import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contracts/GameRunner';

export default function GameContainer() {
    const gameRef = useRef(null);

    // --- web3 state ---
    const [account, setAccount] = useState('');
    const [userBalance, setUserBalance] = useState('0');
    const [ladderPool, setLadderPool] = useState('0');
    const [isOwner, setIsOwner] = useState(false);
    const [blockchainLeaderboard, setBlockchainLeaderboard] = useState([]);
    const [isPaused, setIsPaused] = useState(false);
    const [playerDiscount, setPlayerDiscount] = useState('0');

    // admin state
    const [newFeeInput, setNewFeeInput] = useState('');
    const [newPoolInput, setNewPoolInput] = useState('');
    const [newTimerInput, setNewTimerInput] = useState('10');

    // timer state
    const [timeLeftToPayout, setTimeLeftToPayout] = useState(600);
    const [timerTrigger, setTimerTrigger] = useState(0);

    const [statusText, setStatusText] = useState('');

    // game state
    const [gameState, setGameState] = useState('menu');
    const [activeTab, setActiveTab] = useState('rules');
    const [score, setScore] = useState(0);
    const [autoLeaderboardStatus, setAutoLeaderboardStatus] = useState('');
    const [congratsMessage, setCongratsMessage] = useState('');

    // on-chain profile stats
    const [onChainMaxScore, setOnChainMaxScore] = useState(0);
    const [onChainGamesPlayed, setOnChainGamesPlayed] = useState(0);
    const [hasCenturionAchievement, setHasCenturionAchievement] = useState(false);

    // economy state
    const [gameCoins, setGameCoins] = useState(0);
    const [hasPaidGlobalEntry, setHasPaidGlobalEntry] = useState(false);
    const [entryFee, setEntryFee] = useState('0.001');
    const [playerCustomFee, setPlayerCustomFee] = useState('0.001');
    const ROUND_COST = 3;

    // custom skins
    const [selectedChar, setSelectedChar] = useState('green');
    const [unlockedChars, setUnlockedChars] = useState(['green']);
    const [upgrades, setUpgrades] = useState({ jump: 0, slide: 0, reaction: 0 });

    const characters = {
        green: { name: 'Cadet', color: 0x10b981, price: 0, desc: 'Classic balanced cube', textColor: 'text-emerald-400' },
        blue: { name: 'Acrobat', color: 0x06b6d4, price: 10, desc: 'Better air control', textColor: 'text-cyan-400' },
        yellow: { name: 'Speedster', color: 0xf59e0b, price: 25, desc: 'Faster reaction speed', textColor: 'text-amber-400' }
    };

    const upgradeCosts = {
        jump: [5, 10, 20, 40, 'MAX'],
        slide: [5, 10, 20, 40, 'MAX'],
        reaction: [8, 15, 30, 50, 'MAX']
    };

    // local storage coins save
    const saveCoins = (newAmount) => {
        if (!account) return;
        const addr = account.toLowerCase();
        setGameCoins(newAmount);
        localStorage.setItem(`game_coins_${addr}`, newAmount);
    };

    // sync user profile
    useEffect(() => {
        if (!account) {
            setGameCoins(0);
            setHasPaidGlobalEntry(false);
            setSelectedChar('green');
            setUnlockedChars(['green']);
            setUpgrades({ jump: 0, slide: 0, reaction: 0 });
            return;
        }

        const addr = account.toLowerCase();
        const localCoins = Number(localStorage.getItem(`game_coins_${addr}`)) || 0;
        if (gameCoins !== localCoins) setGameCoins(localCoins);

        const isPaid = localStorage.getItem(`global_entry_paid_${addr}`) === 'true';
        if (hasPaidGlobalEntry !== isPaid) setHasPaidGlobalEntry(isPaid);

        const activeChar = localStorage.getItem(`temple_char_${addr}`) || 'green';
        if (selectedChar !== activeChar) setSelectedChar(activeChar);

        const savedSkins = localStorage.getItem(`unlocked_chars_${addr}`);
        if (savedSkins) {
            const parsed = JSON.parse(savedSkins);
            if (JSON.stringify(unlockedChars) !== savedSkins) setUnlockedChars(parsed);
        }

        const savedUpgrades = localStorage.getItem(`temple_upgrades_${addr}`);
        if (savedUpgrades) {
            const parsed = JSON.parse(savedUpgrades);
            if (JSON.stringify(upgrades) !== savedUpgrades) setUpgrades(parsed);
        }
    }, [account]);

    // load blockchain info
    const loadContractData = async (userAddr) => {
        if (!window.ethereum || !userAddr) return;
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const balWei = await provider.getBalance(userAddr);
            setUserBalance(Number(ethers.formatEther(balWei)).toFixed(4));

            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

            const baseFee = await contract.entryFee();
            const personalFee = await contract.getEntryFeeForPlayer(userAddr);
            const contractPaused = await contract.paused();
            const poolWei = await contract.ladderPool();
            const tier = Number(await contract.playerDiscountTier(userAddr));

            const MY_ADMIN_ADDRESS = "0xed53c0f2bc7d9a87424286073b9fc31ff8371cda";

            try {
                const ownerAddress = await contract.owner();
                setIsOwner(
                    ownerAddress.toLowerCase() === userAddr.toLowerCase() ||
                    userAddr.toLowerCase() === MY_ADMIN_ADDRESS
                );
            } catch (ownerErr) {
                if (userAddr.toLowerCase() === MY_ADMIN_ADDRESS) {
                    setIsOwner(true);
                }
                console.log("Owner check skipped", ownerErr);
            }

            setEntryFee(ethers.formatEther(baseFee));
            setPlayerCustomFee(ethers.formatEther(personalFee));
            setIsPaused(contractPaused);
            setLadderPool(ethers.formatEther(poolWei));

            const discountValues = { 0: '0%', 1: '30%', 2: '40%', 3: '50%' };
            setPlayerDiscount(discountValues[tier] || '0%');

            const profile = await contract.getPlayerProfile(userAddr);
            setOnChainMaxScore(Number(profile[0]));
            setOnChainGamesPlayed(Number(profile[1]));
            setHasCenturionAchievement(profile[2]);

            try {
                const ownerAddress = await contract.owner();
                setIsOwner(ownerAddress.toLowerCase() === userAddr.toLowerCase());
            } catch (ownerErr) {
                console.log("Owner check skipped", ownerErr);
            }

            try {
                const leaders = await contract.getLeaderboard();
                const processedLeaders = leaders.map(l => ({
                    player: l.player,
                    shortPlayer: `${l.player.slice(0, 6)}...${l.player.slice(-4)}`,
                    score: Number(l.score)
                }));
                setBlockchainLeaderboard(processedLeaders);
            } catch (leaderboardErr) {
                console.log("Leaderboard empty", leaderboardErr);
            }
        } catch (err) {
            console.error(err);
        }
    };

    // payout system logic
    const handleDistributePoolSilent = async () => {
        try {
            setStatusText('Processing round payout...');
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const currentLeaders = [...blockchainLeaderboard];
            const tx = await contract.distributeLadderPool();
            await tx.wait();

            const myIndex = currentLeaders.findIndex(l => l.player.toLowerCase() === account.toLowerCase());
            if (myIndex !== -1 && myIndex < 3) {
                const placementText = myIndex === 0 ? "1st PLACE 🏆" : myIndex === 1 ? "2nd PLACE 🥈" : "3rd PLACE 🥉";
                setCongratsMessage(`CONGRATULATIONS! You just won the ladder round at ${placementText}! Your payout and a permanent discount have been credited!`);
            }

            loadContractData(account);
            setStatusText('Ladder pool successfully distributed!');
            setTimeout(() => setStatusText(''), 5000);
        } catch (e) {
            console.error(e);
            setStatusText('Distribution skip (empty pool or no players)');
            setTimeout(() => setStatusText(''), 4000);
        }
    };

    // timer loop
    useEffect(() => {
        const intervalDurationSeconds = parseFloat(newTimerInput) * 60 || 600;
        let targetPayoutTime = localStorage.getItem('next_payout_timestamp');

        if (!targetPayoutTime) {
            targetPayoutTime = Date.now() + intervalDurationSeconds * 1000;
            localStorage.setItem('next_payout_timestamp', targetPayoutTime);
        }

        const timer = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((Number(targetPayoutTime) - now) / 1000));

            setTimeLeftToPayout(remaining);

            if (remaining <= 0) {
                const newTarget = Date.now() + intervalDurationSeconds * 1000;
                localStorage.setItem('next_payout_timestamp', newTarget);

                if (isOwner && account) {
                    handleDistributePoolSilent();
                }
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [newTimerInput, isOwner, account, timerTrigger]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // connect wallet
    const connectWallet = async () => {
        if (!window.ethereum) return alert('Please install MetaMask!');
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            setAccount(accounts[0]);
            await loadContractData(accounts[0]);
        } catch (err) {
            console.error(err);
        }
    };

    // payment trigger
    const handleGlobalEntryPayment = async () => {
        if (isPaused) return alert('Contract is paused by admin!');
        if (!account) return alert('Connect wallet first!');
        setStatusText('Purchasing coin pack...');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const tx = await contract.startGame({ value: ethers.parseEther(playerCustomFee) });
            await tx.wait();

            const addr = account.toLowerCase();
            saveCoins(gameCoins + 15);
            setHasPaidGlobalEntry(true);
            localStorage.setItem(`global_entry_paid_${addr}`, 'true');

            setStatusText('Success! 15 coins added.');
            await loadContractData(account);
        } catch (err) {
            console.error(err);
            alert("Payment transaction failed.");
        } finally { setStatusText(''); }
    };

    // run arcade round
    const handleStartRound = () => {
        if (gameCoins < ROUND_COST) return alert(`You need at least ${ROUND_COST} coins!`);
        saveCoins(gameCoins - ROUND_COST);
        setAutoLeaderboardStatus('');
        setCongratsMessage('');
        setGameState('playing');
    };

    // write blockchain score record
    const handleClaimRewardContractAuto = async (finalScore) => {
        if (!account || finalScore < 20) return;
        setAutoLeaderboardStatus('Syncing highscore to blockchain ladder...');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const currentLeaders = [...blockchainLeaderboard];
            const tx = await contract.claimReward(finalScore);
            await tx.wait();

            const profile = await contract.getPlayerProfile(account);

            if (profile[2] && !hasCenturionAchievement) {
                saveCoins(gameCoins + 50);
                setCongratsMessage("UNLOCKED ON-CHAIN ACHIEVEMENT: 'CENTURION'! +50 Bonus Coins minted!");
            } else {
                const willBeInTop3 = currentLeaders.length < 3 || finalScore > (currentLeaders[2]?.score || 0);
                if (willBeInTop3) {
                    setCongratsMessage(`Your score of ${finalScore} placed you right into the Leaderboard prize pool!`);
                } else {
                    setCongratsMessage(`NICE SHOT! Score ${finalScore} synced to the blockchain ladder!`);
                }
            }

            setAutoLeaderboardStatus('Highscore saved into the smart contract!');
            await loadContractData(account);
        } catch (err) {
            console.error(err);
            setAutoLeaderboardStatus('Failed to save score on-chain.');
        }
    };

    const buySkin = (charKey, price) => {
        if (!account) return alert('Connect wallet!');
        if (gameCoins < price) return alert('Low coins balance!');
        const addr = account.toLowerCase();
        const updatedSkins = [...unlockedChars, charKey];
        setUnlockedChars(updatedSkins);
        localStorage.setItem(`unlocked_chars_${addr}`, JSON.stringify(updatedSkins));
        saveCoins(gameCoins - price);
        setSelectedChar(charKey);
        localStorage.setItem(`temple_char_${addr}`, charKey);
    };

    const buyUpgrade = (type) => {
        if (!account) return alert('Connect wallet!');
        const currentLvl = upgrades[type];
        if (currentLvl >= 4) return alert('Maxed out!');
        const cost = upgradeCosts[type][currentLvl];
        if (gameCoins < cost) return alert('Low coins balance!');
        const addr = account.toLowerCase();
        const updatedUpgrades = { ...upgrades, [type]: currentLvl + 1 };
        setUpgrades(updatedUpgrades);
        localStorage.setItem(`temple_upgrades_${addr}`, JSON.stringify(updatedUpgrades));
        saveCoins(gameCoins - cost);
    };

    // admin tools
    const handleUpdateFeeContract = async () => {
        if (!newFeeInput) return;
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await new ethers.BrowserProvider(window.ethereum).getSigner());
            await (await contract.setEntryFee(ethers.parseEther(newFeeInput))).wait();
            alert('Fee updated!'); setNewFeeInput(''); loadContractData(account);
        } catch (e) { console.error(e); }
    };

    const handleUpdatePoolContract = async () => {
        if (!newPoolInput) return;
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await new ethers.BrowserProvider(window.ethereum).getSigner());
            await (await contract.setLadderPool(ethers.parseEther(newPoolInput))).wait();
            alert('Pool updated!'); setNewPoolInput(''); loadContractData(account);
        } catch (e) { console.error(e); }
    };

    const handleUpdateTimerAdmin = () => {
        const mins = parseFloat(newTimerInput);
        if (isNaN(mins) || mins <= 0) return alert("Wrong minutes");
        const newTarget = Date.now() + mins * 60 * 1000;
        localStorage.setItem('next_payout_timestamp', newTarget);
        setTimerTrigger(prev => prev + 1);
        alert(`Timer reset to ${mins} mins.`);
    };

    const handleTogglePauseContract = async () => {
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await new ethers.BrowserProvider(window.ethereum).getSigner());
            const tx = await contract.togglePause();
            await tx.wait();
            alert('Contract pause status swapped!');
            loadContractData(account);
        } catch (e) { console.error(e); }
    };

    const handleWithdrawAdmin = async () => {
        try {
            setStatusText('Withdrawing profits from contract...');
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await new ethers.BrowserProvider(window.ethereum).getSigner());
            const tx = await contract.withdraw();
            await tx.wait();
            setStatusText('All profits transferred to admin wallet!');
            await loadContractData(account);
            setTimeout(() => setStatusText(''), 4000);
        } catch (e) {
            console.error(e);
            setStatusText('Withdraw failed (balance is 0)');
            setTimeout(() => setStatusText(''), 4000);
        }
    };

    // --- Phaser engine code ---
    useEffect(() => {
        if (gameState !== 'playing') {
            if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null; }
            return;
        }

        const config = {
            type: Phaser.AUTO, width: 500, height: 500,
            parent: 'phaser-game-container',
            physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
            scene: { preload, create, update }
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        let player, obstacles, speedLines, cursors, keyA, keyD, keyW, keyS;
        let currentScore = 0;
        let scoreText, coinsText, spawnTimer, speedLineTimer;
        const lanes = [150, 250, 350];
        let currentLane = 1;
        let playerState = 'running';
        let slideTimer = null, activeTurn = null, turnIndicator = null, turnTimeout = null;

        function preload() {}
        function create() {
            const scene = this;
            currentScore = 0;
            scene.add.rectangle(250, 250, 300, 500, 0x111827);
            scene.add.line(0, 0, 200, 0, 200, 500, 0x1f2937).setOrigin(0);
            scene.add.line(0, 0, 300, 0, 300, 500, 0x1f2937).setOrigin(0);
            speedLines = scene.add.group();
            player = scene.add.rectangle(lanes[currentLane], 400, 36, 36, characters[selectedChar].color);
            scene.physics.add.existing(player);
            obstacles = scene.physics.add.group();

            scoreText = scene.add.text(20, 20, 'SCORE: 0', { fontSize: '18px', fontFamily: 'monospace', fontWeight: 'bold', fill: '#f3f4f6' });
            coinsText = scene.add.text(20, 45, 'COINS: +0', { fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold', fill: '#fbbf24' });

            cursors = scene.input.keyboard.createCursorKeys();
            keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);

            spawnTimer = scene.time.addEvent({ delay: 1300, callback: spawnEvent, callbackScope: scene, loop: true });
            speedLineTimer = scene.time.addEvent({ delay: 150, callback: spawnSpeedLine, callbackScope: scene, loop: true });
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
                if (activeTurn === 'left' && (Phaser.Input.Keyboard.JustDown(cursors.left) || Phaser.Input.Keyboard.JustDown(keyA))) { triggerCameraTurn(scene, -90); return; }
                if (activeTurn === 'right' && (Phaser.Input.Keyboard.JustDown(cursors.right) || Phaser.Input.Keyboard.JustDown(keyD))) { triggerCameraTurn(scene, 90); return; }
            }

            if (!activeTurn) {
                if (Phaser.Input.Keyboard.JustDown(cursors.left) || Phaser.Input.Keyboard.JustDown(keyA)) {
                    if (currentLane > 0) { currentLane--; player.x = lanes[currentLane]; }
                }
                if (Phaser.Input.Keyboard.JustDown(cursors.right) || Phaser.Input.Keyboard.JustDown(keyD)) {
                    if (currentLane < 2) { currentLane++; player.x = lanes[currentLane]; }
                }
            }

            if ((Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(keyW)) && playerState === 'running') {
                playerState = 'jumping'; player.setFillStyle(0x38bdf8);
                scene.tweens.add({
                    targets: player, scaleY: 1.8, duration: 450 + upgrades.jump * 40, yoyo: true,
                    onComplete: () => { playerState = 'running'; player.setScale(1); player.setFillStyle(characters[selectedChar].color); }
                });
            }

            if ((Phaser.Input.Keyboard.JustDown(cursors.down) || Phaser.Input.Keyboard.JustDown(keyS)) && playerState === 'running') {
                playerState = 'sliding'; player.setFillStyle(0x64748b); player.scaleY = 0.3;
                if (slideTimer) slideTimer.destroy();
                slideTimer = scene.time.delayedCall(700 + upgrades.slide * 50, () => {
                    if (playerState === 'sliding') { playerState = 'running'; player.setScale(1); player.setFillStyle(characters[selectedChar].color); }
                });
            }

            obstacles.getChildren().forEach((obs) => {
                if (obs.y > 550) {
                    obs.destroy();
                    currentScore += 1;
                    scoreText.setText('SCORE: ' + currentScore);
                    coinsText.setText('COINS: +' + Math.floor(currentScore / 5));
                }
            });
        }

        function spawnSpeedLine() {
            const scene = this;
            speedLines.add(scene.add.rectangle(Phaser.Math.Between(110, 390), -20, 2, Phaser.Math.Between(15, 40), 0xffffff, 0.1));
        }

        function triggerCameraTurn(scene, angle) {
            activeTurn = null; if (turnIndicator) turnIndicator.destroy(); if (turnTimeout) turnTimeout.remove();
            currentScore += 5;
            scoreText.setText('SCORE: ' + currentScore);
            coinsText.setText('COINS: +' + Math.floor(currentScore / 5));
            scene.cameras.main.flash(150, 250, 204, 21);
            scene.cameras.main.rotateTo(angle * (Math.PI / 180), true, 250, 'Quad.easeOut');
            scene.time.delayedCall(300, () => { scene.cameras.main.setRotation(0); obstacles.clear(true, true); });
        }

        function createObstacleObject(scene, lane, type) {
            let obs = type === 'low' ? scene.add.rectangle(lane, -50, 36, 36, 0x475569) :
                type === 'high' ? scene.add.rectangle(lane, -50, 80, 4, 0x22c55e) :
                    scene.add.rectangle(lane, -50, 80, 80, 0x000000);
            obs.setData('type', type); scene.physics.add.existing(obs); obstacles.add(obs);
            obs.body.setVelocityY(300 + currentScore * 5);
        }

        function spawnEvent() {
            const scene = this; if (activeTurn) return;
            const rand = Phaser.Math.Between(0, 100);
            if (rand < 12 && currentScore > 5) {
                activeTurn = Phaser.Math.Between(0, 1) === 0 ? 'left' : 'right';
                turnIndicator = scene.add.text(250, 150, activeTurn === 'left' ? '◀◀ LEFT' : 'RIGHT ▶▶', { fontSize: '28px', fontFamily: 'monospace', fill: '#fbbf24', backgroundColor: '#000000dd' }).setOrigin(0.5);
                turnTimeout = scene.time.delayedCall(1200 + upgrades.reaction * 150, () => gameOverEnd(scene));
            } else {
                createObstacleObject(scene, Phaser.Math.RND.pick(lanes), Phaser.Math.RND.pick(['low', 'high', 'pit']));
            }
        }

        function handleCollision(playerObj, obstacleObj) {
            const type = obstacleObj.getData('type');
            if (type === 'low' && playerState === 'jumping') return;
            if (type === 'pit' && playerState === 'jumping') return;
            if (type === 'high' && playerState === 'sliding') return;
            gameOverEnd(this);
        }

        function gameOverEnd(scene) {
            scene.physics.pause(); spawnTimer.destroy(); speedLineTimer.destroy();
            if (turnTimeout) turnTimeout.remove();

            const finalScore = currentScore;
            const coinsEarned = Math.floor(finalScore / 5);

            scene.time.delayedCall(1000, () => {
                saveCoins(gameCoins + coinsEarned);
                setScore(finalScore);
                setGameState('gameover');

                if (finalScore >= 20) {
                    handleClaimRewardContractAuto(finalScore);
                }
            });
        }

        return () => { game.destroy(true); };
    }, [gameState]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="flex flex-col items-center justify-center min-h-[620px] w-full max-w-xl mx-auto p-4 bg-slate-950 rounded-3xl border border-slate-900 text-slate-100 shadow-2xl overflow-hidden relative font-mono">
            {/* WEB3 STATUS */}
            <div className="w-full flex justify-between items-center mb-4 px-2">
                <div className="flex flex-col text-left text-xs">
                    <span className="text-[10px] text-slate-500 uppercase">MetaMask</span>
                    <span className="text-sky-400 font-bold">{account ? `${account.slice(0, 6)}...${account.slice(-4)} (${userBalance} ETH)` : 'Not connected'}</span>
                </div>
                <div className="flex flex-col text-right text-xs">
                    <span className="text-[10px] text-slate-500 uppercase">My Bank</span>
                    <span className="text-yellow-400 font-bold">🪙 {gameCoins} COINS</span>
                </div>
            </div>

            {account ? (
                <div className="w-full flex flex-col gap-1 mb-4 p-2 bg-slate-900/40 rounded-xl border border-slate-900 text-[10px]">
                    <div className="flex justify-between w-full">
                        <span className="text-emerald-400 font-bold">Ganache Network Active {isPaused && <b className="text-red-500 uppercase ml-2">[PAUSED]</b>}</span>
                        <span className="text-purple-400">⏱️ Top payout in: <b className="text-white">{formatTime(timeLeftToPayout)}</b></span>
                    </div>
                    <div className="flex justify-between w-full text-slate-400 border-t border-slate-900 pt-1 text-[9px]">
                        <span>Base Price: {entryFee} ETH</span>
                        <span className="text-yellow-400 font-bold">Your Discount Tier: {playerDiscount} (Price: {playerCustomFee} ETH)</span>
                    </div>
                </div>
            ) : (
                <button onClick={connectWallet} className="w-full py-3 bg-sky-600 text-slate-950 font-black rounded-xl text-xs tracking-wider mb-4">CONNECT METAMASK</button>
            )}

            {/* LIVE CONGRATS ALERTS BOARD */}
            {congratsMessage && (
                <div className="w-full text-center p-3 bg-emerald-950/80 text-emerald-400 border border-emerald-800 text-[11px] mb-4 rounded-xl shadow-lg font-bold animate-pulse">
                    {congratsMessage}
                </div>
            )}

            {statusText && <div className="w-full text-center py-2 bg-slate-900 text-yellow-400 text-[11px] mb-4 rounded-xl animate-pulse">{statusText}</div>}

            {/* MAIN DASHBOARD */}
            {gameState === 'menu' && (
                <div className="w-full flex flex-col items-center space-y-5">
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-indigo-500">CUBE RUNNER</h1>

                    <div className="w-full grid grid-cols-4 sm:grid-cols-7 gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-900 text-[10px]">
                        {[{ id: 'rules', label: 'Rules' }, { id: 'characters', label: 'Skins' }, { id: 'upgrades', label: 'Perks' }, { id: 'shop', label: 'Shop 🪙' }, { id: 'stats', label: 'Badges' }, { id: 'leaderboard', label: 'Ladder' }, { id: 'admin', label: 'Admin', hide: !isOwner }].map(tab => !tab.hide && (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`py-2 font-bold rounded-lg ${activeTab === tab.id ? 'bg-slate-800 text-sky-400 border border-slate-700' : 'text-slate-400'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'rules' && (
                        <div className="w-full text-xs text-slate-400 space-y-2 bg-slate-900/20 p-4 rounded-2xl border border-slate-900/60 text-left">
                            <p className="text-slate-200 font-bold">ARCADE RULES:</p>
                            <p>• Controls: <span className="text-sky-400">W / S</span> (jump/slide), <span className="text-yellow-500">A / D</span> (camera quick turn action).</p>
                            <p>• Economy: <span className="text-yellow-400">every 5 score points = +1 coin reward!</span></p>
                            <p>• Permanent Rewards: Land in the Top 3 inside the blockchain ladder round to secure a **Permanent Lifetime Fee Discount** up to 50%!</p>
                        </div>
                    )}

                    {activeTab === 'characters' && (
                        <div className="w-full grid grid-cols-3 gap-2 text-left">
                            {Object.entries(characters).map(([key, char]) => (
                                <button key={key} onClick={() => unlockedChars.includes(key) ? (setSelectedChar(key), account && localStorage.setItem(`temple_char_${account.toLowerCase()}`, key)) : buySkin(key, char.price)} className={`flex flex-col items-center p-3 rounded-2xl border ${selectedChar === key ? 'bg-slate-950 border-sky-500' : 'bg-slate-900/40 border-slate-800'}`}>
                                    <div className="w-8 h-8 rounded-lg mb-2" style={{ backgroundColor: `#${char.color.toString(16)}` }} />
                                    <span className={`text-xs font-bold ${char.textColor}`}>{char.name}</span>
                                    <span className="text-[10px] text-slate-500 mt-1">{unlockedChars.includes(key) ? 'Selected' : `🪙 ${char.price}`}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {activeTab === 'upgrades' && (
                        <div className="w-full space-y-2 text-left text-xs">
                            {Object.entries({ jump: '⚡ Jump Extender', slide: '🛡️ Slide Shield', reaction: '🧭 Timer Buff' }).map(([id, name]) => (
                                <div key={id} className="flex justify-between items-center bg-slate-900/50 p-2 rounded-xl border border-slate-900">
                                    <span>{name} (Lvl {upgrades[id]}/4)</span>
                                    <button onClick={() => buyUpgrade(id)} disabled={upgrades[id] >= 4} className="px-3 py-1 bg-yellow-500 text-slate-950 font-bold rounded-lg text-[10px]">
                                        {upgrades[id] >= 4 ? 'MAX' : `🪙 ${upgradeCosts[id][upgrades[id]]}`}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'shop' && (
                        <div className="w-full p-4 bg-slate-900/40 border border-slate-900 rounded-xl text-center space-y-2 text-xs">
                            <p>Pack Offer: Claim 15 coins for <b className="text-yellow-400">{playerCustomFee} ETH</b></p>
                            <button onClick={handleGlobalEntryPayment} disabled={isPaused} className={`py-2 px-6 font-bold rounded-xl ${isPaused ? 'bg-slate-800 text-slate-500' : 'bg-yellow-500 text-slate-950'}`}>
                                {isPaused ? 'CONTRACT PAUSED' : 'BUY COINS PACK'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'stats' && (
                        <div className="w-full space-y-4 text-left text-xs bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                            <h3 className="text-sm font-bold text-sky-400 border-b border-slate-800 pb-1">On-Chain Player Profile</h3>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                    <span className="text-slate-500 block">PERSONAL BEST</span>
                                    <span className="text-white font-bold text-sm">{onChainMaxScore} pts</span>
                                </div>
                                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                    <span className="text-slate-500 block">TOTAL PACK RUNS</span>
                                    <span className="text-white font-bold text-sm">{onChainGamesPlayed} times</span>
                                </div>
                            </div>

                            <h3 className="text-sm font-bold text-yellow-400 border-b border-slate-800 pt-2 pb-1">Badges & Accomplishments</h3>
                            <div className="space-y-2">
                                <div className={`p-3 rounded-xl border flex justify-between items-center ${hasCenturionAchievement ? 'bg-amber-950/20 border-amber-600/50' : 'bg-slate-950/40 border-slate-900 text-slate-600'}`}>
                                    <div>
                                        <h4 className={`font-bold ${hasCenturionAchievement ? 'text-amber-400' : 'text-slate-500'}`}>🛡️ Centurion Warrior</h4>
                                        <p className="text-[10px] text-slate-500">Reach over 100 points in a single run session.</p>
                                    </div>
                                    <span className="text-[10px] font-bold bg-slate-900 px-2 py-1 rounded border border-slate-800">
                                        {hasCenturionAchievement ? "Unlocked (+50🪙)" : "Locked"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'leaderboard' && (
                        <div className="w-full bg-slate-900/40 p-4 rounded-2xl border border-slate-900 text-xs text-left space-y-2">
                            <div className="flex justify-between font-bold text-slate-400">
                                <span>On-Chain Top 5 (Active Pool: {ladderPool} ETH)</span>
                            </div>
                            <div className="space-y-1">
                                {blockchainLeaderboard.map((item, i) => (
                                    <div key={i} className="flex justify-between py-1 border-b border-slate-900">
                                        <span className={i < 3 ? "text-yellow-400 font-bold" : "text-slate-300"} >
                                            {i + 1}. {item.shortPlayer} {item.player.toLowerCase() === account.toLowerCase() && " (You)"}
                                        </span>
                                        <span className="text-sky-400 font-bold">{item.score} pts</span>
                                    </div>
                                ))}
                                {blockchainLeaderboard.length === 0 && <p className="text-slate-600 italic">No score submissions yet inside this cycle.</p>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'admin' && isOwner && account && (
                        <div className="w-full bg-slate-900/40 p-4 rounded-2xl border border-slate-900 space-y-3 text-xs text-left">
                            <h2 className="text-red-400 font-bold uppercase tracking-wider">Smart Contract Management</h2>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Base Pack Fee (ETH)" value={newFeeInput} onChange={e => setNewFeeInput(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs" />
                                <button onClick={handleUpdateFeeContract} className="bg-sky-600 text-slate-950 px-3 rounded-lg font-bold">Set</button>
                            </div>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Force Ladder Pool (ETH)" value={newPoolInput} onChange={e => setNewPoolInput(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs" />
                                <button onClick={handleUpdatePoolContract} className="bg-sky-600 text-slate-950 px-3 rounded-lg font-bold">Set</button>
                            </div>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Payout Cycle Time (min)" value={newTimerInput} onChange={e => setNewTimerInput(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs" />
                                <button onClick={handleUpdateTimerAdmin} className="bg-amber-500 text-slate-950 px-3 rounded-lg font-bold">Reset Ring</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <button onClick={handleTogglePauseContract} className={`py-2 font-black rounded-lg text-center text-white ${isPaused ? 'bg-emerald-600' : 'bg-red-600'}`}>
                                    {isPaused ? '▶️ UNPAUSE CONTRACT' : '⏸️ EMERGENCY PAUSE'}
                                </button>
                                <button onClick={handleDistributePoolSilent} className="py-2 bg-indigo-600 text-white font-bold rounded-lg text-center">
                                    ⚙️ FORCE PAYOUT ROUND
                                </button>
                            </div>

                            <button onClick={handleWithdrawAdmin} className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-lg text-center mt-1">
                                💰 WITHDRAW TOTAL PROFITS TO ADMIN WALLET
                            </button>
                        </div>
                    )}

                    {account ? (
                        gameCoins === 0 && !hasPaidGlobalEntry ? (
                            <button onClick={handleGlobalEntryPayment} disabled={isPaused} className={`w-full py-4 text-white font-black rounded-2xl text-sm tracking-widest shadow-lg bg-gradient-to-r ${isPaused ? 'from-slate-800 to-slate-900 cursor-not-allowed' : 'from-sky-500 to-indigo-600'}`}>
                                {isPaused ? 'CONTRACT IS TEMPORARILY PAUSED' : `BUY STARTING COINS FOR ${playerCustomFee} ETH`}
                            </button>
                        ) : (
                            <button onClick={handleStartRound} className="w-full py-4 bg-emerald-500 text-slate-950 font-black rounded-2xl text-sm tracking-widest shadow-lg">
                                🏃 START ROUND (COST: {ROUND_COST} 🪙)
                            </button>
                        )
                    ) : (
                        <div className="w-full p-4 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-400">
                            🔒 Authenticate MetaMask account above to interact.
                        </div>
                    )}
                </div>
            )}

            {/* ARCADE GAME CANVAS VIEW CONTAINER */}
            {gameState === 'playing' && (
                <div className="w-full flex flex-col items-center">
                    <div id="phaser-game-container" className="rounded-2xl overflow-hidden border border-slate-800" />
                </div>
            )}

            {/* CRASH SUMMARY SCREEN */}
            {gameState === 'gameover' && (
                <div className="w-full flex flex-col items-center py-6 space-y-6 text-center">
                    <h2 className="text-red-500 text-5xl font-black tracking-widest">CRASHED!</h2>

                    <div className="w-full max-w-sm bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                        <div className="flex justify-between"><span>Final Score:</span><span className="font-bold text-white text-lg">{score}</span></div>
                        <div className="flex justify-between border-t border-slate-900 pt-2"><span>Coins Minted:</span><span className="font-bold text-yellow-400">🪙 +{Math.floor(score / 5)}</span></div>
                    </div>

                    {score >= 20 && (
                        <div className="w-full max-w-sm p-3 bg-slate-900 border border-emerald-900/60 text-emerald-400 rounded-xl text-[11px]">
                            {autoLeaderboardStatus || "⏳ Processing on-chain records..."}
                        </div>
                    )}

                    <div className="w-full flex flex-col gap-2">
                        <button onClick={() => setGameState('menu')} className="w-full py-3 bg-sky-600 text-slate-950 font-bold rounded-xl text-xs">
                            RETURN TO DASHBOARD
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}