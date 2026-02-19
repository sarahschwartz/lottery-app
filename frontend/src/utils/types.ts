import type { Address, Hex } from "viem";

export type SessionState = {
  sessionId: bigint;
  maxNumber: number;
  drawTimestamp: bigint;
  payout: bigint;
  winner: `0x${string}`;
  winningNumberSet: boolean;
  payoutClaimed: boolean;
};

export type SessionResult = readonly [
  number,
  number,
  bigint,
  bigint,
  `0x${string}`,
  `0x${string}`,
  boolean,
  boolean,
];

export type BlockReader = { getBlock: () => Promise<{ timestamp: bigint }> };
export type PreviousSessionRow = {
  sessionId: bigint;
  winningNumber: number;
  payout: bigint;
  winner: `0x${string}`;
  payoutClaimed: boolean;
  winningNumberSet: boolean;
};

export interface PasskeyCredential {
  credentialId: string;
  credentialPublicKey: number[];
  userName: string;
  userDisplayName: string;
}

export interface UserProfileWallet {
  createdAt: string;
  updatedAt: string;
  userId: string;
  walletAddress: Address;
}

type AuthorizeTransactionParams = {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    calldata: Hex;
    value: bigint;
} | {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    calldata: Hex;
    value?: never;
} | {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    calldata?: never;
    value: bigint;
};

export type AuthorizeTxFn = (params: AuthorizeTransactionParams) => Promise<{ message: string; activeUntil: string }>;