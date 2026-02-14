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

    await game.write.createSession([300, 10], { value: payout });

    assert.equal(await game.read.nextSessionId(), 1n);
    assert.equal(await publicClient.getBalance({ address: game.address }), payout);

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
      game.write.pickNumber([0n, 301], { account: player2.account }),
      "number out of range",
    );

    await game.write.pickNumber([0n, 256], { account: player2.account });
    await game.write.pickNumber([0n, 257], { account: admin.account });

    assert.equal(await game.read.getPickedNumber([0n, player1.account.address]), 1);
    assert.equal(await game.read.getPickedNumber([0n, player2.account.address]), 256);
    assert.equal(await game.read.getPickedNumber([0n, admin.account.address]), 257);

    const bitmap = await game.read.getTakenBitmap([0n]);
    assert.equal(bitmap.length, 2);
    assert.equal(bitmap[0], (1n << 0n) | (1n << 255n));
    assert.equal(bitmap[1], 1n);
  });

  it("requires session to end before draw and allows only winner to claim once", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("1");

    await game.write.createSession([10, 1], { value: payout });
    await game.write.pickNumber([0n, 3], { account: player1.account });
    await game.write.pickNumber([0n, 7], { account: player2.account });

    await viem.assertions.revertWith(
      game.write.setWinningNumber([0n, 7], { account: admin.account }),
      "too early",
    );

    await testClient.increaseTime({ seconds: 61 });
    await testClient.mine({ blocks: 1 });

    await game.write.setWinningNumber([0n, 7], { account: admin.account });

    await viem.assertions.revertWith(
      game.write.claimPayout([0n], { account: player1.account }),
      "not winner",
    );

    await game.write.claimPayout([0n], { account: player2.account });

    assert.equal(await publicClient.getBalance({ address: game.address }), 0n);

    const session = await game.read.sessions([0n]);
    assert.equal(session[3], payout);
    assert.equal(session[6], true);

    await viem.assertions.revertWith(
      game.write.claimPayout([0n], { account: player2.account }),
      "payout already claimed",
    );
  });

  it("refunds payout to admin if no one picked the winning number", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("2");

    await game.write.createSession([20, 1], { value: payout });
    await game.write.pickNumber([0n, 5], { account: player1.account });

    await testClient.increaseTime({ seconds: 61 });
    await testClient.mine({ blocks: 1 });

    await game.write.setWinningNumber([0n, 8], { account: admin.account });

    const session = await game.read.sessions([0n]);
    assert.equal(session[4].toLowerCase(), "0x0000000000000000000000000000000000000000");
    assert.equal(session[6], true);
    assert.equal(await publicClient.getBalance({ address: game.address }), 0n);

    await viem.assertions.revertWith(
      game.write.claimPayout([0n], { account: player1.account }),
      "payout already claimed",
    );
  });

  it("restricts withdrawContractFunds to admin", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("1");

    await game.write.createSession([20, 5], { value: payout });

    await viem.assertions.revertWith(
      game.write.withdrawContractFunds([player1.account.address, 1n], {
        account: player1.account,
      }),
      "only admin",
    );

    await viem.assertions.revertWith(
      game.write.withdrawContractFunds([admin.account.address, payout + 1n], {
        account: admin.account,
      }),
      "insufficient balance",
    );

    await game.write.withdrawContractFunds([admin.account.address, payout], {
      account: admin.account,
    });

    assert.equal(await publicClient.getBalance({ address: game.address }), 0n);
  });

  it("allows admin to transfer admin role", async function () {
    const game = await viem.deployContract("NumberGuessingGame");
    const payout = parseEther("1");

    await viem.assertions.revertWith(
      game.write.changeAdmin([player1.account.address], {
        account: player1.account,
      }),
      "only admin",
    );

    await game.write.changeAdmin([player1.account.address], {
      account: admin.account,
    });

    assert.equal(
      (await game.read.admin()).toLowerCase(),
      player1.account.address.toLowerCase(),
    );

    await viem.assertions.revertWith(
      game.write.createSession([10, 5], { account: admin.account, value: payout }),
      "only admin",
    );

    await game.write.createSession([10, 5], {
      account: player1.account,
      value: payout,
    });

    assert.equal(await game.read.nextSessionId(), 1n);
  });
});
