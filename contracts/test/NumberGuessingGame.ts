import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther } from "viem";

describe("NumberGuessingGame", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const [admin, player1, player2] = await viem.getWalletClients();

  it("creates sessions and enforces one unique immutable number per player", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("1");

    await game.write.createSession([90], { value: payout });

    assert.equal(await game.read.nextSessionId(), 1n);
    assert.equal(
      await publicClient.getBalance({ address: game.address }),
      payout,
    );

    await game.write.pickNumber([0n, 1], { account: player1.account });

    await viem.assertions.revertWith(
      game.write.pickNumber([0n, 1], { account: player2.account }),
      "number already picked",
    );

    await viem.assertions.revertWith(
      game.write.pickNumber([0n, 2], { account: player1.account }),
      "already picked",
    );

    await viem.assertions.revertWith(
      game.write.pickNumber([0n, 91], { account: player2.account }),
      "number out of range",
    );

    await game.write.pickNumber([0n, 2], { account: player2.account });
    assert.equal(
      await game.read.getPickedNumber([0n, player1.account.address]),
      1,
    );
  });

  it("requires 1 day before draw and allows only winner to claim once", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("1");

    await game.write.createSession([10], { value: payout });
    await game.write.pickNumber([0n, 3], { account: player1.account });
    await game.write.pickNumber([0n, 7], { account: player2.account });

    await viem.assertions.revertWith(
      game.write.setWinningNumber([0n, 7]),
      "too early",
    );

    await testClient.increaseTime({ seconds: 24 * 60 * 60 + 1 });
    await testClient.mine({ blocks: 1 });

    await game.write.setWinningNumber([0n, 7], { account: admin.account });

    await viem.assertions.revertWith(
      game.write.claimPayout([0n], { account: player1.account }),
      "not winner",
    );

    await game.write.claimPayout([0n], { account: player2.account });

    assert.equal(await publicClient.getBalance({ address: game.address }), 0n);

    await viem.assertions.revertWith(
      game.write.claimPayout([0n], { account: player2.account }),
      "payout already claimed",
    );
  });

  it("handles no-winner rounds and restricts emergency withdrawal to admin", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("2");

    await game.write.createSession([20], { value: payout });
    await game.write.pickNumber([0n, 5], { account: player1.account });

    await testClient.increaseTime({ seconds: 24 * 60 * 60 + 1 });
    await testClient.mine({ blocks: 1 });

    await game.write.setWinningNumber([0n, 8], { account: admin.account });

    await viem.assertions.revertWith(
      game.write.claimPayout([0n], { account: player1.account }),
      "no winner",
    );

    await viem.assertions.revertWith(
      game.write.emergencyWithdraw([player1.account.address, 1n], {
        account: player1.account,
      }),
      "only admin",
    );

    await viem.assertions.revertWith(
      game.write.emergencyWithdraw([admin.account.address, payout + 1n], {
        account: admin.account,
      }),
      "insufficient balance",
    );

    await game.write.emergencyWithdraw([admin.account.address, payout], {
      account: admin.account,
    });

    assert.equal(await publicClient.getBalance({ address: game.address }), 0n);
  });

  it("allows admin to transfer admin role", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("1");

    await viem.assertions.revertWith(
      game.write.changeAdmin([player1.account.address], { account: player1.account }),
      "only admin",
    );

    await game.write.changeAdmin([player1.account.address], { account: admin.account });
    assert.equal(
      (await game.read.admin()).toLowerCase(),
      player1.account.address.toLowerCase(),
    );

    await viem.assertions.revertWith(
      game.write.createSession([10], { account: admin.account, value: payout }),
      "only admin",
    );

    await game.write.createSession([10], { account: player1.account, value: payout });
    assert.equal(await game.read.nextSessionId(), 1n);
  });
});
