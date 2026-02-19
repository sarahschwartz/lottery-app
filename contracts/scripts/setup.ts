import { network } from 'hardhat';
import { Abi, type Address, defineChain, PublicClient,} from 'viem';

const GAME_CONTRACT_ADDRESS: Address = '0x809d550fca64d94Bd9F66E60752A544199cfAC3D';
export async function setupGame(){

    const { viem } = await network.connect('localPrividium');
    
    const localPrividium = defineChain({
      id: 6565,
      name: 'Local Prividium',
      network: 'localPrividium',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['http://127.0.0.1:24101/rpc'] } },
    });
    
    const publicClient = await viem.getPublicClient({ chain: localPrividium });
    const [senderClient] = await viem.getWalletClients({ chain: localPrividium });
    if (!senderClient) throw new Error('No wallet client.');
    
    const gameContract = await viem.getContractAt('NumberGuessingGame', GAME_CONTRACT_ADDRESS, {
      client: { public: publicClient, wallet: senderClient },
    });

    return { gameContract, publicClient, senderClient, GAME_CONTRACT_ADDRESS };
}

export async function canEditAdmins(publicClient: PublicClient, gameContractAbi: Abi, senderAddress: Address){
  const isAdmin = await publicClient.readContract({
        address: GAME_CONTRACT_ADDRESS,
    abi: gameContractAbi,
    functionName: 'admins',
    args: [senderAddress]
  })
  
  console.log("Sender is authorized to add new admin:", isAdmin)
  
  if(!isAdmin) throw new Error("Sender cannot add new admin");
}