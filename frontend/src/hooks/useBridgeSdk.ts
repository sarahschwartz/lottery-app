import { createPublicClient, createWalletClient, defineChain, http, type PublicClient } from 'viem';
import { createViemClient, createViemSdk } from '@matterlabs/zksync-js/viem';
import { loadExistingPasskey } from '../utils/sso/passkeys';

export function useBridgeSdk(rpcClient: PublicClient,) {
    const { savedAccount } = loadExistingPasskey();

    const l1ChainId = import.meta.env.VITE_L1_CHAIN_ID || 31337;
    const l1RpcUrl = import.meta.env.VITE_L1_RPC_URL || " http://localhost:5010";

    const l1Chain = defineChain({
            id: l1ChainId,
            name:
              (import.meta.env.VITE_L1_CHAIN_NAME as string) ||
              `L1-${l1ChainId}`,
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: {
              default: { http: [l1RpcUrl] },
            },
          });

          const l1PublicClient = l1Chain
        ? createPublicClient({
              chain: l1Chain,
              transport: http()
          })
        : null;

    function getZKsyncSDK() {
        if (!l1PublicClient || !l1Chain || !savedAccount) {
            return null;
        }

        const l1Wallet = createWalletClient({
            account: savedAccount,
            chain: l1Chain,
            transport: http(l1RpcUrl)
        });

        const client = createViemClient({
            l1: l1PublicClient,
            l2: rpcClient,
            l1Wallet: l1Wallet
        });
        const sdk = createViemSdk(client);
        return sdk;
    }

    return {
        getZKsyncSDK,
        l1PublicClient
    };
}
