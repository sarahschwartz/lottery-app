import { formatEther, parseEther } from "viem";
import { setupPaymaster } from "./setup.js";

const depositEth = "0.5";

const { paymasterContract, publicClient, senderClient } =
  await setupPaymaster();

const depositWei = parseEther(depositEth);
console.log(`Depositing ${depositEth} ETH into EntryPoint via paymaster...`);
const hash = await paymasterContract.write.deposit({
  value: depositWei,
  account: senderClient.account,
});
await publicClient.waitForTransactionReceipt({ hash });
const currentDeposit = await paymasterContract.read.entryPointDeposit();
console.log(`EntryPoint paymaster deposit: ${formatEther(currentDeposit)} ETH`);

console.log("✅ PAYMASTER funded");
