import { useState } from 'react'
import { ethers } from "ethers";
import './App.css'

// ВРЕМЕННЫЙ АДРЕС. Когда мы деплоим контракт в Remix, мы заменим этот адрес на Твой!
const CONTRACT_ADDRESS = "0x8FE1250B0ae3Ec6f40Ea5D8cf575c76CA59356cC"

// ABI нашего нового игрового контракта GameRunner
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
  const [score, setScore] = useState(""); // Для ручного тестирования очков

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

  // Получение объекта контракта для транзакций (с подписью signer)
  async function getContract() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }

  // Загрузка данных контракта (баланс и владелец)
  async function loadContractData() {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const contractBalance = await contract.getContractBalance();
      const contractOwner = await contract.owner();

      setBalance(ethers.formatEther(contractBalance));
      setOwner(contractOwner);
    } catch (e) {
      console.log("Контракт еще не задеплоен или адрес неверный");
    }
  }

  // Оплата входа в игру (0.001 ETH)
  async function payForGame() {
    try {
      const contract = await getContract();
      const tx = await contract.startGame({
        value: ethers.parseEther("0.001"), // Фиксированная стоимость входа
      });
      await tx.wait();
      alert("Игра оплачена! Можешь начинать забег.");
    } catch (err) {
      console.error(err);
      alert("Ошибка при оплате игры");
    }
  }

  // Отправка результатов и получение награды
  async function submitScore() {
    if (!score || Number(score) < 0) {
      alert("Введите корректное количество очков");
      return;
    }

    try {
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
    }
  }

  // Вывод средств владельцем
  async function handleWithdraw() {
    try {
      const contract = await getContract();
      const tx = await contract.withdraw();
      await tx.wait();
      alert("Средства успешно выведены!");
      await loadContractData();
    } catch (err) {
      console.error(err);
      alert("Ошибка вывода");
    }
  }

  return (
      <div className='container'>
        <h1>Web3 Runner Game</h1>
        <p>Платформа для игры на смарт-контрактах</p>

        {account ? (
            <div className='card'>
              <p>
                <b>Ваш кошелек:</b> {account}
              </p>
            </div>
        ) : (
            <button onClick={connectWallet}>Подключить MetaMask</button>
        )}

        {account && (
            <>
              <div className='card'>
                <h2>Начать игру</h2>
                <p>Стоимость попытки: 0.001 SepoliaETH</p>
                <button onClick={payForGame}>Оплатить вход в игру</button>
              </div>

              <div className='card'>
                <h2>Отправить результат (Тест)</h2>
                <input
                    type='number'
                    placeholder='Ваш результат (Score)'
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                />
                <button onClick={submitScore}>Отправить очки</button>
              </div>
            </>
        )}

        <div className='card'>
          <h2>Информация о контракте</h2>
          <p>
            <b>Баланс призового фонда:</b> {balance} ETH
          </p>
          <p>Владелец контракта: {owner || "Не определен"}</p>
          <button onClick={loadContractData}>Обновить данные</button>
        </div>

        {account && owner && account.toLowerCase() === owner.toLowerCase() && (
            <div className='card'>
              <h2>Панель владельца</h2>
              <button onClick={handleWithdraw}>Вывести все ETH с контракта</button>
            </div>
        )}
      </div>
  );
}

export default App;