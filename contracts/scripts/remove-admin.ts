import { type Abi, isAddress } from "viem";
import { setupGame } from "./setup.js";

const removeAdminAddress = "0x8e291C58adaef3edDc101F269d05383359aacd37";

if (!isAddress(removeAdminAddress))
  throw new Error("removeAdminAddress is not properly set");

const { gameContract, publicClient, senderClient, GAME_CONTRACT_ADDRESS } =
  await setupGame();

const admins = await publicClient.readContract({
  address: GAME_CONTRACT_ADDRESS,
  abi: gameContract.abi as Abi,
  functionName: "admins",
  args: [senderClient.account.address],
});

console.log("Sender is authorized to remove admin:", admins);

const tx = await senderClient.writeContract({
  address: GAME_CONTRACT_ADDRESS,
  abi: gameContract.abi as Abi,
  functionName: "removeAdmin",
  args: [removeAdminAddress],
});
await publicClient.waitForTransactionReceipt({ hash: tx });
console.log("Transaction sent successfully!");
console.log(`${removeAdminAddress} removed as admin`);
