import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './contracts/GameRunner';

const CHAR_BUFFS = {
    green:  { coinMod: 1.0, jumpMod: 1.0, slideMod: 1.0 },
    blue:   { coinMod: 1.5, jumpMod: 1.0, slideMod: 1.0 },
    yellow: { coinMod: 1.0, jumpMod: 1.4, slideMod: 1.4 }
};

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

const lanes = [110, 225, 340];

export default function GameContainer() {
    const gameRef = useRef(null);

    const [account, setAccount] = useState('');
    const [userBalance, setUserBalance] = useState('0');
    const [ladderPool, setLadderPool] = useState('0');
    const [isOwner, setIsOwner] = useState(false);
    const [blockchainLeaderboard, setBlockchainLeaderboard] = useState([]);
    const [isPaused, setIsPaused] = useState(false);
    const [playerDiscount, setPlayerDiscount] = useState('0');

    const [newFeeInput, setNewFeeInput] = useState('');
    const [newPoolInput, setNewPoolInput] = useState('');
    const [newTimerInput, setNewTimerInput] = useState('10');

    const [timeLeftToPayout, setTimeLeftToPayout] = useState(600);
    const [timerTrigger, setTimerTrigger] = useState(0);

    const [statusText, setStatusText] = useState('');

    const [gameState, setGameState] = useState('menu');
    const [activeTab, setActiveTab] = useState('rules');
    const [score, setScore] = useState(0);
    const [autoLeaderboardStatus, setAutoLeaderboardStatus] = useState('');
    const [congratsMessage, setCongratsMessage] = useState('');

    const [onChainMaxScore, setOnChainMaxScore] = useState(0);
    const [onChainGamesPlayed, setOnChainGamesPlayed] = useState(0);
    const [hasCenturionAchievement, setHasCenturionAchievement] = useState(false);

    const [gameCoins, setGameCoins] = useState(0);
    const [hasPaidGlobalEntry, setHasPaidGlobalEntry] = useState(false);
    const [entryFee, setEntryFee] = useState('0.001');
    const [playerCustomFee, setPlayerCustomFee] = useState('0.001');
    const ROUND_COST = 3;

    const [selectedChar, setSelectedChar] = useState('green');
    const [unlockedChars, setUnlockedChars] = useState(['green']);
    const [upgrades, setUpgrades] = useState({ jump: 0, slide: 0, reaction: 0 });

    const saveCoins = (newAmount) => {
        if (!account) return;
        const addr = account.toLowerCase();
        setGameCoins(newAmount);
        localStorage.setItem(`game_coins_${addr}`, newAmount);
    };

    // sync local storage config data safely
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
        const isPaid = localStorage.getItem(`global_entry_paid_${addr}`) === 'true';
        const activeChar = localStorage.getItem(`temple_char_${addr}`) || 'green';
        const savedSkins = localStorage.getItem(`unlocked_chars_${addr}`);
        const savedUpgrades = localStorage.getItem(`temple_upgrades_${addr}`);

        setGameCoins(localCoins);
        setHasPaidGlobalEntry(isPaid);
        setSelectedChar(activeChar);

        if (savedSkins) setUnlockedChars(JSON.parse(savedSkins));
        if (savedUpgrades) setUpgrades(JSON.parse(savedUpgrades));
    }, [account]);


    // fetch data from web3 contract
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
                                                    //replace yours^^^


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

    // manage ladder round payouts
    const handleDistributePoolSilent = async () => {
        try {
            setStatusText('Processing round payout...');
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const currentLeaders = [...blockchainLeaderboard];
            const tx = await contract.distributeLadderPool({
                gasLimit: 300000
            });

            setStatusText('Transaction sent! Waiting for block...');
            await tx.wait();

            const myIndex = currentLeaders.findIndex(l => l.player.toLowerCase() === account.toLowerCase());
            if (myIndex !== -1 && myIndex < 1) {
                setCongratsMessage(`CONGRATULATIONS! You just won the ladder round as CHAMPION!`);
            }

            await loadContractData(account);
            setStatusText('Ladder pool successfully distributed!');
            setTimeout(() => setStatusText(''), 5000);
        } catch (e) {
            console.error("REAL BLOCKCHAIN ERROR:", e);
            setStatusText(`Error: ${e.reason || e.message || 'Unknown EVM error'}`);
            setTimeout(() => setStatusText(''), 6000);
        }
    };

    const isAutoDistributing = useRef(false);

    // Countdown loop for contract cycle
    useEffect(() => {
        const intervalDurationSeconds = parseFloat(newTimerInput) * 60 || 600;
        let targetPayoutTime = localStorage.getItem('next_payout_timestamp');

        if (!targetPayoutTime) {
            targetPayoutTime = Date.now() + intervalDurationSeconds * 1000;
            localStorage.setItem('next_payout_timestamp', targetPayoutTime);
        }

        const timer = setInterval(async () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((Number(targetPayoutTime) - now) / 1000));

            setTimeLeftToPayout(remaining);
            if (remaining <= 0 && !isAutoDistributing.current) {

                if (isOwner && account) {
                    isAutoDistributing.current = true;

                    try {
                        await handleDistributePoolSilent();

                        const newTarget = Date.now() + intervalDurationSeconds * 1000;
                        localStorage.setItem('next_payout_timestamp', newTarget);
                        setTimeLeftToPayout(intervalDurationSeconds);
                    } catch (err) {
                        console.error("Auto payout failed:", err);
                    } finally {
                        isAutoDistributing.current = false;
                    }
                } else {
                    const newTarget = Date.now() + intervalDurationSeconds * 1000;
                    localStorage.setItem('next_payout_timestamp', newTarget);
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

    const handleGlobalEntryPayment = async () => {
        if (isPaused) return alert('Contract is paused by admin!');
        if (!account) return alert('Connect wallet first!');
        setStatusText('Purchasing coin pack...');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            const requiredFee = await contract.getEntryFeeForPlayer(account);
            const tx = await contract.startGame({ value: requiredFee });
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

    const handleStartRound = () => {
        if (gameCoins < ROUND_COST) return alert(`You need at least ${ROUND_COST} coins!`);
        saveCoins(gameCoins - ROUND_COST);
        setAutoLeaderboardStatus('');
        setCongratsMessage('');
        setGameState('playing');
    };

    const handleClaimRewardContractAuto = async (finalScore) => {
        if (!account || finalScore < 20) return;
        setAutoLeaderboardStatus('Syncing highscore to blockchain ladder...');
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const currentLeaders = [...blockchainLeaderboard];

            const tx = await contract.claimReward(finalScore, {
                gasLimit: 700000
            });
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
        const totalUpgradesCount = upgrades.jump + upgrades.slide + upgrades.reaction + 1;
        const addr = account.toLowerCase();
        if (totalUpgradesCount === 1 && localStorage.getItem(`ach_first_upgrade_${addr}`) !== 'true') {
            localStorage.setItem(`ach_first_upgrade_${addr}`, 'true');
            saveCoins(gameCoins + 25);
            setCongratsMessage("LOCAL ACHIEVEMENT UNLOCKED: First Upgrade bought! +25 Coins!");
        }
        if (!account) return alert('Connect wallet!');
        const currentLvl = upgrades[type];
        if (currentLvl >= 4) return alert('Maxed out!');
        const cost = upgradeCosts[type][currentLvl];
        if (gameCoins < cost) return alert('Low coins balance!');
        const updatedUpgrades = { ...upgrades, [type]: currentLvl + 1 };
        setUpgrades(updatedUpgrades);
        localStorage.setItem(`temple_upgrades_${addr}`, JSON.stringify(updatedUpgrades));
        saveCoins(gameCoins - cost);
    };

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
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const valueToSend = ethers.parseEther(newPoolInput);

            const tx = await contract.setLadderPool(valueToSend, {
                value: valueToSend,
                gasLimit: 100000
            });

            await tx.wait();
            alert('Pool updated with real ETH!');
            setNewPoolInput('');
            loadContractData(account);
        } catch (e) {
            console.error(e);
        }
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

    // phaser runtime logic loop
    useEffect(() => {
        if (gameState !== 'playing') {
            if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null; }
            return;
        }

        const activeBuffs = CHAR_BUFFS[selectedChar] || CHAR_BUFFS.green;

        const config = {
            type: Phaser.AUTO,
            width: 450,
            height: 600,
            parent: 'phaser-game-container',
            physics: {
                default: 'arcade',
                arcade: { gravity: { y: 0 }, debug: false }
            },
            scene: {
                preload: function() {},
                create: create,
                update: update
            }
        };

        const game = new Phaser.Game(config);

        game.registry.set('coinMod', activeBuffs.coinMod);
        game.registry.set('jumpMod', activeBuffs.jumpMod);
        game.registry.set('slideMod', activeBuffs.slideMod);
        gameRef.current = game;

        let player, obstacles, speedLines, cursors, keyA, keyD, keyW, keyS;
        let currentScore = 0;
        let scoreText, coinsText, spawnTimer, speedLineTimer;
        let currentLane = 1;
        let playerState = 'running';
        let slideTimer = null, activeTurn = null, turnIndicator = null, turnTimeout = null;
        let bgRect;
        let currentBgStage = 1;

        function create() {
            const scene = this;
            currentScore = 0;
            currentBgStage = 1;
            bgRect = scene.add.rectangle(225, 300, 450, 600, 0x111827);

            scene.add.line(0, 0, 165, 0, 165, 600, 0x1f2937).setOrigin(0);
            scene.add.line(0, 0, 285, 0, 285, 600, 0x1f2937).setOrigin(0);

            speedLines = scene.add.group();
            obstacles = scene.physics.add.group();

            player = scene.add.rectangle(lanes[currentLane], 520, 36, 36, characters[selectedChar].color);
            scene.physics.add.existing(player);

            scoreText = scene.add.text(20, 20, 'SCORE: 0', { fontSize: '18px', fontFamily: 'monospace', fontWeight: 'bold', fill: '#f3f4f6' });
            coinsText = scene.add.text(20, 45, 'COINS: +0', { fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold', fill: '#fbbf24' });

            cursors = scene.input.keyboard.createCursorKeys();
            keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
            keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);

            spawnTimer = scene.time.addEvent({ delay: 1500, callback: spawnEvent, callbackScope: scene, loop: true });
            speedLineTimer = scene.time.addEvent({ delay: 150, callback: spawnSpeedLine, callbackScope: scene, loop: true });
            scene.physics.add.overlap(player, obstacles, handleCollision, null, scene);
        }

        function update() {
            const scene = this;
            const currentSpeed = 300 + currentScore * 5;

            const coinMod = scene.game.registry.get('coinMod') || 1.0;
            const jumpMod = scene.game.registry.get('jumpMod') || 1.0;
            const slideMod = scene.game.registry.get('slideMod') || 1.0;

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
                playerState = 'jumping';
                player.setFillStyle(0x38bdf8);
                const jumpDuration = (320 + upgrades.jump * 30) * jumpMod;
                scene.tweens.add({
                    targets: player, scaleY: 1.8, duration: jumpDuration, yoyo: true,
                    onComplete: () => { playerState = 'running'; player.setScale(1); player.setFillStyle(characters[selectedChar].color); }
                });
            }

            if ((Phaser.Input.Keyboard.JustDown(cursors.down) || Phaser.Input.Keyboard.JustDown(keyS)) && playerState === 'running') {
                playerState = 'sliding';
                player.setFillStyle(0x64748b);
                player.scaleY = 0.3;
                if (slideTimer) slideTimer.destroy();

                const slideDuration = (500 + upgrades.slide * 40) * slideMod;
                slideTimer = scene.time.delayedCall(slideDuration, () => {
                    if (playerState === 'sliding') { playerState = 'running'; player.setScale(1); player.setFillStyle(characters[selectedChar].color); }
                });
            }

            obstacles.getChildren().forEach((obs) => {
                if (obs.y > 550) {
                    obs.destroy();
                    currentScore += 1;
                    scoreText.setText('SCORE: ' + currentScore);

                    const coinsEarned = Math.floor((currentScore / 5) * coinMod);
                    coinsText.setText('COINS: +' + coinsEarned);
                }
            });

            let targetColor = null;
            if (currentScore > 50 && currentScore <= 100 && currentBgStage === 1) {
                currentBgStage = 2;
                targetColor = 0x2e1065;
            } else if (currentScore > 100 && currentScore <= 150 && currentBgStage === 2) {
                currentBgStage = 3;
                targetColor = 0x450a0a;
            } else if (currentScore > 150 && currentBgStage === 3) {
                currentBgStage = 4;
                targetColor = 0x064e3b;
            }

            if (targetColor !== null && bgRect) {
                const startColor = Phaser.Display.Color.IntegerToColor(bgRect.fillColor);
                const endColor = Phaser.Display.Color.IntegerToColor(targetColor);
                scene.tweens.add({
                    targets: bgRect,
                    duration: 2500,
                    from: 0,
                    to: 1,
                    onUpdate: (tween) => {
                        const colorObj = Phaser.Display.Color.Interpolate.ColorWithColor(startColor, endColor, 1, tween.getValue());
                        bgRect.setFillStyle(Phaser.Display.Color.GetColor(colorObj.r, colorObj.g, colorObj.b));
                    }
                });
            }
        }

        function spawnSpeedLine() {
            const scene = this;
            speedLines.add(scene.add.rectangle(Phaser.Math.Between(200, 600), -20, 2, Phaser.Math.Between(15, 40), 0xffffff, 0.1));
        }

        function triggerCameraTurn(scene, angle) {
            activeTurn = null; if (turnIndicator) turnIndicator.destroy(); if (turnTimeout) turnTimeout.remove();
            currentScore += 5;
            const coinMod = scene.game.registry.get('coinMod') || 1.0;
            scoreText.setText('SCORE: ' + currentScore);
            coinsText.setText('COINS: +' + Math.floor((currentScore / 5) * coinMod));
            scene.cameras.main.flash(150, 250, 204, 21);
            scene.cameras.main.rotateTo(angle * (Math.PI / 180), true, 250, 'Quad.easeOut');
            scene.time.delayedCall(300, () => { scene.cameras.main.setRotation(0); obstacles.clear(true, true); });
        }

        function createObstacleObject(scene, lane, type) {
            let obs;
            let speed = 250;
            if (currentScore > 50 && currentScore <= 100) speed = 360;
            if (currentScore > 100) speed = 440;

            if (type === 'low') {
                obs = scene.add.rectangle(lane, -50, 36, 30, 0xef4444);
            } else if (type === 'high') {
                obs = scene.add.rectangle(lane, -110, 80, 20, 0x3b82f6);
            } else if (type === 'pit') {
                obs = scene.add.rectangle(lane, -50, 36, 90, 0x1f2937);
                obs.setStrokeStyle(3, 0xf59e0b);
            }

            obs.setData('type', type);
            scene.physics.add.existing(obs);
            obstacles.add(obs);
            obs.body.setVelocityY(speed);
        }

        function spawnEvent() {
            const scene = this; if (activeTurn) return;

            let currentStage = 1;
            if (currentScore <= 50) {
                spawnTimer.delay = 1700;
            } else if (currentScore > 50 && currentScore <= 100) {
                spawnTimer.delay = 1300;
                currentStage = 2;
            } else {
                spawnTimer.delay = 1050;
                currentStage = 3;
            }

            const randTurn = Phaser.Math.Between(0, 100);
            if (randTurn < 12 && currentScore > 10) {
                activeTurn = Phaser.Math.Between(0, 1) === 0 ? 'left' : 'right';
                turnIndicator = scene.add.text(225, 200, activeTurn === 'left' ? '◀◀ LEFT' : 'RIGHT ▶▶', {
                    fontSize: '24px',
                    fontFamily: 'monospace',
                    fill: '#fbbf24',
                    backgroundColor: '#000000dd'
                }).setOrigin(0.5);

                turnTimeout = scene.time.delayedCall(1200 + upgrades.reaction * 150, () => gameOverEnd(scene));
                return;
            }

            const patterns = [
                { lanes: [0], types: ['low'] }, { lanes: [1], types: ['low'] }, { lanes: [2], types: ['low'] },
                { lanes: [0], types: ['high'] }, { lanes: [1], types: ['high'] }, { lanes: [2], types: ['high'] },
                { lanes: [0], types: ['pit'] }, { lanes: [1], types: ['pit'] }, { lanes: [2], types: ['pit'] },
                { lanes: [0, 1], types: ['pit', 'pit'] }, { lanes: [1, 2], types: ['pit', 'pit'] }, { lanes: [0, 2], types: ['pit', 'pit'] },
                { lanes: [0, 1], types: ['low', 'low'] }, { lanes: [1, 2], types: ['low', 'low'] }, { lanes: [0, 2], types: ['low', 'low'] },
                { lanes: [0, 1], types: ['high', 'high'] }, { lanes: [1, 2], types: ['high', 'high'] }, { lanes: [0, 2], types: ['high', 'high'] },
                { lanes: [0, 1], types: ['low', 'high'] }, { lanes: [1, 2], types: ['low', 'high'] }, { lanes: [0, 2], types: ['low', 'high'] },
                { lanes: [0, 1], types: ['pit', 'low'] },  { lanes: [1, 2], types: ['pit', 'low'] },  { lanes: [0, 2], types: ['pit', 'low'] },
                { lanes: [0, 1], types: ['pit', 'high'] }, { lanes: [1, 2], types: ['pit', 'high'] }, { lanes: [0, 2], types: ['pit', 'high'] },
                { lanes: [0, 1, 2], types: ['low', 'low', 'low'] },
                { lanes: [0, 1, 2], types: ['high', 'high', 'high'] },
                { lanes: [0, 1, 2], types: ['pit', 'pit', 'pit'] },
                { lanes: [0, 1, 2], types: ['low', 'high', 'low'] },
                { lanes: [0, 1, 2], types: ['high', 'pit', 'high'] },
                { lanes: [0, 1, 2], types: ['pit', 'low', 'pit'] },
                { lanes: [0, 1, 2], types: ['low', 'low', 'high'] },
                { lanes: [0, 1, 2], types: ['high', 'high', 'low'] }
            ];

            const corridorChance = Phaser.Math.Between(0, 100);
            if (corridorChance < 15 && currentStage >= 2 && !scene.inCorridorMode) {
                scene.inCorridorMode = true;

                const luckyLaneIdx = Phaser.Math.Between(0, 2);
                const blockedLanes = [0, 1, 2].filter(l => l !== luckyLaneIdx);

                let corridorTicks = 0;
                const corridorInterval = scene.time.addEvent({
                    delay: 250,
                    loop: true,
                    callback: () => {
                        corridorTicks++;
                        createObstacleObject(scene, lanes[blockedLanes[0]], 'pit');
                        createObstacleObject(scene, lanes[blockedLanes[1]], 'low');
                        if (corridorTicks % 3 === 0) {
                            createObstacleObject(scene, lanes[luckyLaneIdx], Phaser.Utils.Array.GetRandom(['low', 'high']));
                        }
                        if (corridorTicks >= 10) {
                            corridorInterval.destroy();
                            scene.inCorridorMode = false;
                        }
                    }
                });
                return;
            }

            let activePatternsPool;
            if (currentStage === 1) {
                activePatternsPool = patterns.slice(0, 18);
            } else if (currentStage === 2) {
                activePatternsPool = patterns.slice(0, 24);
            } else {
                activePatternsPool = [...patterns];
            }

            const chosenPattern = Phaser.Utils.Array.GetRandom(activePatternsPool);

            for (let i = 0; i < chosenPattern.lanes.length; i++) {
                createObstacleObject(scene, lanes[chosenPattern.lanes[i]], chosenPattern.types[i]);
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
            scene.cameras.main.shake(200, 0.05);
            scene.cameras.main.flash(150, 255, 0, 0);

            scene.physics.pause();
            spawnTimer.destroy();
            speedLineTimer.destroy();
            if (turnTimeout) turnTimeout.remove();

            const finalScore = currentScore;
            const coinMod = scene.game.registry.get('coinMod') || 1.0;
            const coinsEarned = Math.floor((finalScore / 5) * coinMod);

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
    }, [gameState, upgrades, selectedChar]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[620px] w-full max-w-xl mx-auto p-4 bg-slate-950 rounded-3xl border border-slate-900 text-slate-100 shadow-2xl overflow-hidden relative font-mono">
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
                        <span className="text-purple-400">Top payout in: <b className="text-white">{formatTime(timeLeftToPayout)}</b></span>
                    </div>
                    <div className="flex justify-between w-full text-slate-400 border-t border-slate-900 pt-1 text-[9px]">
                        <span>Base Price: {entryFee} ETH</span>
                        <span className="text-yellow-400 font-bold">Your Discount Tier: {playerDiscount} (Price: {playerCustomFee} ETH)</span>
                    </div>
                </div>
            ) : (
                <button onClick={connectWallet} className="w-full py-3 bg-sky-600 text-slate-950 font-black rounded-xl text-xs tracking-wider mb-4">CONNECT METAMASK</button>
            )}

            {congratsMessage && (
                <div className="w-full text-center p-3 bg-emerald-950/80 text-emerald-400 border border-emerald-800 text-[11px] mb-4 rounded-xl shadow-lg font-bold animate-pulse">
                    {congratsMessage}
                </div>
            )}

            {statusText && <div className="w-full text-center py-2 bg-slate-900 text-yellow-400 text-[11px] mb-4 rounded-xl animate-pulse">{statusText}</div>}

            {gameState === 'menu' && (
                <div className="w-full flex flex-col items-center space-y-5">
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-indigo-500">CUBE RUNNER</h1>

                    <div className="w-full grid grid-cols-4 sm:grid-cols-7 gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-900 text-[10px]">
                        {[{ id: 'rules', label: 'Rules' }, { id: 'characters', label: 'Skins' }, { id: 'upgrades', label: 'Perks' }, { id: 'shop', label: 'Shop' }, { id: 'stats', label: 'Badges' }, { id: 'leaderboard', label: 'Ladder' }, { id: 'admin', label: 'Admin', hide: !isOwner }].map(tab => !tab.hide && (
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
                        <div className="space-y-4">
                            <h3 className="text-sm text-slate-400 uppercase tracking-wider">Available Core Manifestations</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {Object.keys(characters).map((charKey) => {
                                    const char = characters[charKey];
                                    const buff = CHAR_BUFFS[charKey];
                                    const isUnlocked = unlockedChars.includes(charKey);
                                    const isSelected = selectedChar === charKey;
                                    return (
                                        <div key={charKey} className={`p-4 rounded-xl border flex flex-col justify-between transition ${isSelected ? 'bg-slate-800/80 border-sky-500 shadow-lg' : 'bg-slate-900/50 border-slate-800'}`}>
                                            <div>
                                                <div className="w-10 h-10 rounded-lg mb-3" style={{ backgroundColor: `#${char.color.toString(16)}` }} />
                                                <h4 className={`font-bold text-base ${char.textColor}`}>{char.name}</h4>
                                                <p className="text-xs text-slate-400 mt-1 mb-2 leading-relaxed">{char.desc}</p>

                                                <div className="text-[10px] text-slate-500 font-mono space-y-0.5 border-t border-slate-800/80 pt-2 mt-2">
                                                    <div>Coin Mult: <span className="text-yellow-500 font-bold">x{buff.coinMod}</span></div>
                                                    <div>Jump Mult: <span className="text-sky-400 font-bold">x{buff.jumpMod}</span></div>
                                                    <div>Slide Mult: <span className="text-indigo-400 font-bold">x{buff.slideMod}</span></div>
                                                </div>
                                            </div>
                                            <div className="mt-4 pt-2">
                                                {isSelected ? (
                                                    <span className="text-xs text-sky-400 font-bold tracking-widest uppercase block text-center">Selected</span>
                                                ) : isUnlocked ? (
                                                    <button onClick={() => { setSelectedChar(charKey); localStorage.setItem(`temple_char_${account.toLowerCase()}`, charKey); }} className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold transition">Equip</button>
                                                ) : (
                                                    <button onClick={() => buySkin(charKey, char.price)} className="w-full py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-xs font-bold text-slate-950 transition flex items-center justify-center gap-1">
                                                        🪙 {char.price} Buy
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'upgrades' && (
                        <div className="space-y-4">
                            <h3 className="text-sm text-slate-400 uppercase tracking-wider">Ability Upgrade Terminal</h3>
                            <div className="space-y-3">
                                {Object.keys(upgrades).map((perkKey) => {
                                    const currentLvl = upgrades[perkKey];
                                    const nextCost = upgradeCosts[perkKey][currentLvl];
                                    return (
                                        <div key={perkKey} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between">
                                            <div>
                                                <h4 className="font-bold text-sm uppercase tracking-wide text-white">{perkKey === 'jump' ? 'Hyper Jump Window' : perkKey === 'slide' ? ' Phased Slide Buffer' : 'Tactical Frame Sync'}</h4>
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    {perkKey === 'jump' ? `Extends safe air uptime. Current: +${currentLvl * 40}ms` :
                                                        perkKey === 'slide' ? `Increases slide state duration. Current: +${currentLvl * 50}ms` :
                                                            `Increases timing window on unexpected splits. Current: +${currentLvl * 150}ms`}
                                                </p>
                                                <div className="flex gap-1 mt-2">
                                                    {[0,1,2,3].map((lvlIdx) => (
                                                        <div key={lvlIdx} className={`w-6 h-1.5 rounded-sm ${lvlIdx < currentLvl ? 'bg-sky-400' : 'bg-slate-800'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                {nextCost === 'MAX' ? (
                                                    <span className="text-xs px-3 py-1.5 bg-slate-800 text-slate-500 font-bold rounded-lg uppercase">Max Level</span>
                                                ) : (
                                                    <button onClick={() => buyUpgrade(perkKey)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold rounded-lg text-xs transition flex items-center gap-1 border border-slate-700">
                                                        🪙 {nextCost} Upgrade
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
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

                            <h3 className="text-sm font-bold text-emerald-400 border-b border-slate-800 pt-2 pb-1">Active Manifestation Perks</h3>
                            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Equipped Unit:</span>
                                    <span className="font-bold uppercase text-white">{characters[selectedChar]?.name || selectedChar}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-900 text-center text-[10px]">
                                    <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800/50">
                                        <span className="text-slate-500 block">COIN MULT</span>
                                        <span className="text-yellow-400 font-bold">x{CHAR_BUFFS[selectedChar]?.coinMod || '1.0'}</span>
                                    </div>
                                    <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800/50">
                                        <span className="text-slate-500 block">JUMP MULT</span>
                                        <span className="text-sky-400 font-bold">x{CHAR_BUFFS[selectedChar]?.jumpMod || '1.0'}</span>
                                    </div>
                                    <div className="bg-slate-900/60 p-1.5 rounded border border-slate-800/50">
                                        <span className="text-slate-500 block">SLIDE MULT</span>
                                        <span className="text-indigo-400 font-bold">x{CHAR_BUFFS[selectedChar]?.slideMod || '1.0'}</span>
                                    </div>
                                </div>
                            </div>

                            <h3 className="text-sm font-bold text-yellow-400 border-b border-slate-800 pt-2 pb-1">Badges & Accomplishments</h3>
                            <div className="space-y-2">
                                <div className={`p-3 rounded-xl border flex justify-between items-center ${hasCenturionAchievement ? 'bg-amber-950/20 border-amber-600/50' : 'bg-slate-950/40 border-slate-900 text-slate-600'}`}>
                                    <div>
                                        <h4 className={`font-bold ${hasCenturionAchievement ? 'text-amber-400' : 'text-slate-500'}`}>Centurion Warrior</h4>
                                        <p className="text-[10px] text-slate-500">Reach over 100 points in a single run session.</p>
                                    </div>
                                    <span className="text-[10px] font-bold bg-slate-900 px-2 py-1 rounded border border-slate-800 text-white">
                    {hasCenturionAchievement ? "Unlocked (+50🪙)" : "Locked"}
                </span>
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === 'leaderboard' && (
                        <div className="w-full bg-slate-900/40 p-4 rounded-2xl border border-slate-900 text-xs text-left space-y-2">
                            <div className="flex justify-between font-bold text-slate-400">
                                <span>Current Bracket Champion (Top 1) (Active Pool: {ladderPool} ETH)</span>
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
                                    {isPaused ? ' UNPAUSE CONTRACT' : 'EMERGENCY PAUSE'}
                                </button>
                                <button onClick={handleDistributePoolSilent} className="py-2 bg-indigo-600 text-white font-bold rounded-lg text-center">
                                    FORCE PAYOUT ROUND
                                </button>
                            </div>

                            <button onClick={handleWithdrawAdmin} className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-lg text-center mt-1">
                                WITHDRAW TOTAL PROFITS TO ADMIN WALLET
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
                                START ROUND (COST: {ROUND_COST} 🪙)
                            </button>
                        )
                    ) : (
                        <div className="w-full p-4 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-400">
                            Authenticate MetaMask account above to interact.
                        </div>
                    )}
                </div>
            )}

            {gameState === 'playing' && (
                <div className="w-full flex flex-col items-center">
                    <div id="phaser-game-container" className="rounded-2xl overflow-hidden border border-slate-800" />
                </div>
            )}

            {gameState === 'gameover' && (
                <div className="w-full flex flex-col items-center py-6 space-y-6 text-center">
                    <h2 className="text-red-500 text-5xl font-black tracking-widest">CRASHED!</h2>

                    <div className="w-full max-w-sm bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                        <div className="flex justify-between"><span>Final Score:</span><span className="font-bold text-white text-lg">{score}</span></div>
                        <div className="flex justify-between border-t border-slate-900 pt-2"><span>Coins Minted:</span><span className="font-bold text-yellow-400">🪙 +{Math.floor(score / 5)}</span></div>
                    </div>

                    {score >= 20 && (
                        <div className="w-full max-w-sm p-3 bg-slate-900 border border-emerald-900/60 text-emerald-400 rounded-xl text-[11px]">
                            {autoLeaderboardStatus || "Processing on-chain records..."}
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