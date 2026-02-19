import { type Hex } from "viem";

// LocalStorage keys
export const STORAGE_KEY_PASSKEY = "zksync_sso_passkey";
export const STORAGE_KEY_ACCOUNT = "zksync_sso_account";

export const RP_ID = window.location.hostname;

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:4340";
export const DEPLOY_ACCOUNT_ENDPOINT = `${BACKEND_URL}/deploy-account`;

export const ssoContracts = {
  webauthnValidator: (import.meta.env.VITE_SSO_WEBAUTHN_VALIDATOR ||
    "0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6") as Hex,
  entryPoint: (import.meta.env.VITE_SSO_ENTRYPOINT ||
    "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108") as Hex,
};

export const WEBAUTHN_VALIDATOR_ABI = [
  {
    type: "function",
    name: "getAccountList",
    inputs: [
      { name: "domain", type: "string" },
      { name: "credentialId", type: "bytes" },
    ],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAccountKey",
    inputs: [
      { name: "domain", type: "string" },
      { name: "credentialId", type: "bytes" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32[2]" }],
    stateMutability: "view",
  },
] as const;

export const ENTRYPOINT_ABI = [
  {
    type: "function",
    name: "getNonce",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
