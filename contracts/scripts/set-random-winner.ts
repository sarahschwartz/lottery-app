import { randomInt } from "node:crypto";

import { network } from "hardhat";
import { isAddress } from "viem";

function usage() {
  console.log(
    "Usage: npx hardhat run scripts/set-random-winner.ts --network <network> -- <contractAddress> <sessionId>",
  );
}

const separatorIndex = process.argv.indexOf("--");
const args = separatorIndex === -1 ? [] : process.argv.slice(separatorIndex + 1);
if (args.length !== 2) {
  usage();
  process.exit(1);
}

const [contractAddress, sessionIdArg] = args;

if (!isAddress(contractAddress)) {
  console.error("Invalid contract address");
  process.exit(1);
}

let sessionId: bigint;
try {
  sessionId = BigInt(sessionIdArg);
} catch {
  console.error("sessionId must be an integer");
  process.exit(1);
}

if (sessionId < 0n) {
  console.error("sessionId must be >= 0");
  process.exit(1);
}

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [adminClient] = await viem.getWalletClients();
const game = await viem.getContractAt("NumberGuessingGame", contractAddress);

const onchainAdmin = await game.read.admin();
if (onchainAdmin.toLowerCase() !== adminClient.account.address.toLowerCase()) {
  console.error(
    `Connected account is not admin.\nConnected: ${adminClient.account.address}\nAdmin:     ${onchainAdmin}`,
  );
  process.exit(1);
}

const session = await game.read.sessions([sessionId]);
const maxNumber = Number(session[0]);
const drawTimestamp = Number(session[2]);
const winningNumberAlreadySet = session[5];

if (maxNumber === 0) {
  console.error("Session does not exist");
  process.exit(1);
}

if (winningNumberAlreadySet) {
  console.error("Winning number already set for this session");
  process.exit(1);
}

const latestBlock = await publicClient.getBlock();
const now = Number(latestBlock.timestamp);
if (now < drawTimestamp) {
  console.error(
    `Too early to draw. Current timestamp: ${now}, draw timestamp: ${drawTimestamp}`,
  );
  process.exit(1);
}

const winningNumber = randomInt(1, maxNumber + 1);
const txHash = await game.write.setWinningNumber(
  [sessionId, winningNumber],
  { account: adminClient.account },
);
await publicClient.waitForTransactionReceipt({ hash: txHash });

const winner = await game.read.pickedByNumber([sessionId, winningNumber]);

console.log("Winning number set");
console.log("Contract:", contractAddress);
console.log("Session ID:", sessionId.toString());
console.log("Winning number:", winningNumber);
console.log("Winner:", winner);
console.log("Tx hash:", txHash);
