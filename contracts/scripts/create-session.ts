import { network } from "hardhat";
import { Address, defineChain, isAddress, parseEther } from "viem";

const CONTRACT_ADDRESS: Address = "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0";
const MAX_NUMBER: bigint = 90n; // number of numbers than can be guessed
const PAYOUT_AMOUNT: string = "0.1"; // amount of ETH to be paid to winner for this session

const PAYOUT_ETH: bigint = parseEther(PAYOUT_AMOUNT);

if (PAYOUT_ETH <= 0n) {
  console.error("payout must be greater than 0");
  process.exit(1);
}

const { viem } = await network.connect("localPrividium");

const localPrividium = defineChain({
  id: 6565,
  name: "Local Prividium",
  network: "localPrividium",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:24101/rpc"] } },
});

const publicClient = await viem.getPublicClient({ chain: localPrividium });
const [adminClient] = await viem.getWalletClients({ chain: localPrividium });
const game = await viem.getContractAt("NumberGuessingGame", CONTRACT_ADDRESS, {
  client: { public: publicClient, wallet: adminClient },
});

const onchainAdmin = await game.read.admin();
if (onchainAdmin.toLowerCase() !== adminClient.account.address.toLowerCase()) {
  console.error(
    `Connected account is not admin.\nConnected: ${adminClient.account.address}\nAdmin:     ${onchainAdmin}`,
  );
  process.exit(1);
}

const nextSessionId = await game.read.nextSessionId();
let createNextSession = true;
if (nextSessionId > 0n) {
  const lastSessionId = nextSessionId - 1n;
  const lastGameInfo = await game.read.sessions([lastSessionId]);
  if (lastGameInfo[5] === false) {
    console.log(
      "Choose a winner of the last session before starting a new one",
    );
    createNextSession = false;
  }
}

if (createNextSession) {
  const txHash = await game.write.createSession([Number(MAX_NUMBER)], {
    account: adminClient.account,
    value: PAYOUT_ETH,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const session = await game.read.sessions([nextSessionId]);
  const drawTimestamp = Number(session[2]);

  console.log("✅ Session created");
  console.log("Session ID:", nextSessionId.toString());
  console.log("Max number:", MAX_NUMBER.toString());
  console.log("Payout (ETH):", PAYOUT_AMOUNT);
  console.log("Draw timestamp:", drawTimestamp);
  console.log("Tx hash:", txHash);
}
