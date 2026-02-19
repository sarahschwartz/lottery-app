import { type Abi, isAddress } from 'viem';
import { canEditAdmins, setupGame } from './setup.js';

const newAdminAddress = '0x4357568d9f710cc9edb3b240633449a394481a79'

if(!isAddress(newAdminAddress)) throw new Error ("newAdminAddress is not properly set");

const { gameContract, publicClient, senderClient, GAME_CONTRACT_ADDRESS } = await setupGame();

await canEditAdmins(publicClient, gameContract.abi as Abi, senderClient.account.address)

const tx = await senderClient.writeContract({
  address: GAME_CONTRACT_ADDRESS,
  abi: gameContract.abi as Abi,
  functionName: 'addAdmin',
  args: [newAdminAddress]
});
await publicClient.waitForTransactionReceipt({ hash: tx });
console.log('Transaction sent successfully!');
console.log(`${newAdminAddress} added as admin.`);

