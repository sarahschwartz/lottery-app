import { network } from "hardhat";
import { Abi, type Address, defineChain, PublicClient } from "viem";

const GAME_CONTRACT_ADDRESS: Address =
  "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
const PAYMASTER_CONTRACT_ADDRESS: Address =
  "0x0165878A594ca255338adfa4d48449f69242Eb8F";

async function setup() {
  const { viem } = await network.connect("localPrividium");

  const localPrividium = defineChain({
    id: 6565,
    name: "Local Prividium",
    network: "localPrividium",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:24101/rpc"] } },
  });

  const publicClient = await viem.getPublicClient({ chain: localPrividium });
  const [senderClient] = await viem.getWalletClients({ chain: localPrividium });
  if (!senderClient) throw new Error("No wallet client.");
  return { publicClient, senderClient, viem };
}

export async function setupGame() {
  const { publicClient, senderClient, viem } = await setup();

  const gameContract = await viem.getContractAt(
    "NumberGuessingGame",
    GAME_CONTRACT_ADDRESS,
    {
      client: { public: publicClient, wallet: senderClient },
    },
  );

  return { gameContract, publicClient, senderClient, GAME_CONTRACT_ADDRESS };
}

export async function canEditAdmins(
  publicClient: PublicClient,
  gameContractAbi: Abi,
  senderAddress: Address,
) {
  const isAdmin = await publicClient.readContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: gameContractAbi,
    functionName: "admins",
    args: [senderAddress],
  });

  console.log("Sender is authorized to add new admin:", isAdmin);

  if (!isAdmin) throw new Error("Sender cannot add new admin");
}


export async function setupPaymaster() {
  const { publicClient, senderClient, viem } = await setup();

  const paymasterContract = await viem.getContractAt(
    "AcceptAllPaymaster",
    PAYMASTER_CONTRACT_ADDRESS,
    {
      client: { public: publicClient, wallet: senderClient },
    },
  );

  return {
    paymasterContract,
    publicClient,
    senderClient,
    PAYMASTER_CONTRACT_ADDRESS,
  };
}
