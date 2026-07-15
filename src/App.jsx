import { useState } from 'react'
import { ethers } from "ethers";
import GameContainer from './GameContainer';
import './App.css'

const CONTRACT_ADDRESS = "0x8FE1250B0ae3Ec6f40Ea5D8cf575c76CA59356cC"

const CONTRACT_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "score",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "reward",
        "type": "uint256"
      }
    ],
    "name": "GameEnded",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "score",
        "type": "uint256"
      }
    ],
    "name": "claimReward",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractBalance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "entryFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "startGame",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
]

function App() {
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("0");
  const [owner, setOwner] = useState("");
  const [score, setScore] = useState("");

  // Новые стейты для игры
  const [isGamePaid, setIsGamePaid] = useState(false);
  const [isTxLoading, setIsTxLoading] = useState(false);

  // Подключение кошелька
  async function connectWallet() {
    if (!window.ethereum) {
      alert("Установи MetaMask!");
      return;
    }
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    setAccount(accounts[0]);
    await loadContractData();
  }

  // Получение контракта
  async function getContract() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }

  // Загрузка данных
  async function loadContractData() {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const contractBalance = await contract.getContractBalance();
      const contractOwner = await contract.owner();
      setBalance(ethers.formatEther(contractBalance));
      setOwner(contractOwner);
    } catch (e) {
      console.log("Контракт еще не задеплоен или адрес неверный", e);
    }
  }

  // Оплата игры (0.001 ETH)
  async function payForGame() {
    if (!account) {
      alert("Сначала подключи кошелек!");
      return;
    }
    try {
      setIsTxLoading(true);
      const contract = await getContract();
      const tx = await contract.startGame({
        value: ethers.parseEther("0.001"),
      });
      await tx.wait();

      setIsGamePaid(true); // Разблокируем игру!
      alert("Оплата подтверждена! Беги!");
      await loadContractData();
    } catch (err) {
      console.error(err);
      alert("Ошибка при оплате игры");
    } finally {
      setIsTxLoading(false);
    }
  }

  // Обработка окончания игры в Phaser
  function handleGameOver(finalScore) {
    setIsGamePaid(false); // Закрываем экран игры
    setScore(finalScore.toString()); // Записываем результат в инпут для отправки в контракт
    alert(`Игра окончена! Вы набрали ${finalScore} очков. Теперь отправьте результат для получения награды.`);
  }

  // Отправка результатов в блокчейн
  async function submitScore() {
    if (!score || Number(score) < 0) {
      alert("Введите корректное количество очков");
      return;
    }
    try {
      setIsTxLoading(true);
      const contract = await getContract();
      const tx = await contract.claimReward(score);
      await tx.wait();

      if (Number(score) > 10) {
        alert("Поздравляем! Вы набрали больше 10 очков и получили х2 награду!");
      } else {
        alert("Результат записан, но для награды нужно набрать больше 10 очков.");
      }

      setScore("");
      await loadContractData();
    } catch (err) {
      console.error(err);
      alert("Ошибка отправки результата");
    } finally {
      setIsTxLoading(false);
    }
  }

  // Вывод средств
  async function handleWithdraw() {
    try {
      setIsTxLoading(true);
      const contract = await getContract();
      const tx = await contract.withdraw();
      await tx.wait();
      alert("Средства успешно выведены!");
      await loadContractData();
    } catch (err) {
      console.error(err);
      alert("Ошибка вывода");
    } finally {
      setIsTxLoading(false);
    }
  }

  return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0B0E14]">
        {/* Хедер с кнопкой кошелька */}
        <header className="w-full max-w-xl flex justify-between items-center mb-12">
          <h1 className="text-xl font-bold tracking-wider text-white">WEB3 RUNNER</h1>

          {account ? (
              <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                {account.slice(0, 6)}...{account.slice(-4)}
              </div>
          ) : (
              <button
                  onClick={connectWallet}
                  className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
              >
                Connect Wallet
              </button>
          )}
        </header>

        <main className="w-full max-w-2xl space-y-6">

          {/* Экран самой игры Phaser ИЛИ карточка оплаты */}
          {isGamePaid ? (
              <div className="p-6 rounded-2xl bg-[#151922] border border-slate-800">
                <GameContainer onGameOver={handleGameOver} />
              </div>
          ) : (
              <div className="p-6 rounded-2xl bg-[#151922] border border-slate-800 space-y-4 text-center">
                <p className="text-xs uppercase tracking-widest text-slate-400">Стоимость попытки</p>
                <p className="text-3xl font-extrabold text-white">0.001 <span className="text-sm font-normal text-slate-400">SepoliaETH</span></p>

                <button
                    onClick={payForGame}
                    disabled={isTxLoading}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium transition shadow-lg shadow-blue-600/20"
                >
                  {isTxLoading ? "Транзакция в обработке..." : "Оплатить вход в игру"}
                </button>
              </div>
          )}

          {/* Тестовая отправка очков */}
          <div className="p-6 rounded-2xl bg-[#151922] border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Отправить результат в контракт</h3>
            <div className="flex gap-2">
              <input
                  type="number"
                  placeholder="Сыграйте в игру, чтобы получить результат"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#0B0E14] border border-slate-800 text-white focus:outline-none focus:border-blue-500 transition"
              />
              <button
                  onClick={submitScore}
                  disabled={isTxLoading}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-white font-medium transition"
              >
                Отправить
              </button>
            </div>
          </div>

          {/* Информация о контракте */}
          <div className="p-6 rounded-2xl bg-[#151922] border border-slate-800 space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Призовой фонд:</span>
              <span className="font-semibold text-white">{balance} ETH</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Владелец:</span>
              <span className="font-mono text-slate-300">
              {owner ? `${owner.slice(0, 8)}...${owner.slice(-4)}` : "Не определен"}
            </span>
            </div>

            <button
                onClick={loadContractData}
                className="w-full py-2 mt-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-xs transition"
            >
              Обновить данные
            </button>
          </div>

          {/* Панель владельца */}
          {account && owner && account.toLowerCase() === owner.toLowerCase() && (
              <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">Панель владельца</p>
                <button
                    onClick={handleWithdraw}
                    disabled={isTxLoading}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 text-white text-sm font-medium transition"
                >
                  Вывести все ETH с контракта
                </button>
              </div>
          )}
        </main>
      </div>
  );
}

export default App;