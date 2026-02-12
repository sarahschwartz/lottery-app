import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NumberGuessingGameModule", (m) => {
  const game = m.contract("NumberGuessingGame");
  return { game };
});
