import { network } from 'hardhat';
import { type Address, defineChain,} from 'viem';

export async function setupGame(){
    const GAME_CONTRACT_ADDRESS: Address = '0x809d550fca64d94Bd9F66E60752A544199cfAC3D';
    
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