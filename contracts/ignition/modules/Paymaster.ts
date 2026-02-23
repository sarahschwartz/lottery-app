import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { Address } from "viem";

export default buildModule("AcceptAllPaymasterModule", (m) => {
  const entryPoint: Address = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108";
  const ownerAddress: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  
  const paymaster = m.contract("AcceptAllPaymaster", [entryPoint, ownerAddress]);
  return { paymaster };
});
