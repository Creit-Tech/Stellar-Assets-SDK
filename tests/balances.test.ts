import { beforeAll, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  Account,
  Address,
  Contract,
  Networks,
  rpc,
  scValToBigInt,
  type Transaction,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import { StellarAssetsSdk } from "../src/sdk.ts";
import type { IBalanceResult } from "../src/types.ts";

const XlmContract: Contract = new Contract("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA");
const UsdcContract: Contract = new Contract("CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75");
const account: Account = new Account("GBAIA5U6E3FSRUW55AXACIVGX2QR5JYAS74OWLED3S22EGXVYEHPLGPA", "0");
const rpcUrl: string = "https://mainnet.sorobanrpc.com";

async function simTx(
  contract: Contract,
  method: string,
  args: xdr.ScVal[],
): Promise<rpc.Api.SimulateTransactionSuccessResponse> {
  const tx: Transaction = new TransactionBuilder(account, {
    networkPassphrase: Networks.PUBLIC,
    fee: "100000",
  })
    .setTimeout(0)
    .addOperation(contract.call(method, ...args))
    .build();

  const sim = await new rpc.Server(rpcUrl).simulateTransaction(tx);

  if (rpc.Api.isSimulationError(sim)) {
    throw { message: "Simulation failed", events: sim.events };
  }

  return sim as rpc.Api.SimulateTransactionSuccessResponse;
}

describe("Test method 'balance'", () => {
  let sdk: StellarAssetsSdk;

  beforeAll(() => {
    sdk = new StellarAssetsSdk({ rpcUrl });
  });

  it("should fetch the native balance owned by a Stellar account", async (): Promise<void> => {
    const simBalance: bigint = await simTx(XlmContract, "balance", [
      new Address(account.accountId()).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(
      XlmContract.contractId(),
      account.accountId(),
    );

    assertEquals(result.trustLine!.balance, simBalance);
  });

  it("should fetch the non-native balance owned by a stellar account", async (): Promise<void> => {
    const simBalance: bigint = await simTx(UsdcContract, "balance", [
      new Address(account.accountId()).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(
      UsdcContract.contractId(),
      account.accountId(),
    );

    assertEquals(result.balance, simBalance);
  });

  it("should fetch the native balance owned by a soroban contract", async (): Promise<void> => {
    const simBalance: bigint = await simTx(XlmContract, "balance", [
      new Address(XlmContract.contractId()).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(
      XlmContract.contractId(),
      XlmContract.contractId(),
    );

    assertEquals(result.balance, simBalance);
  });

  it("should fetch the soroban asset balance owned by a soroban contract", async (): Promise<void> => {
    const usdxUsdcPool: string = "CA73MQDXDHT7Z37KIWP5BCRGAKOXDK2FLR3OPVKNUJUEHK5SWL74SE4K";
    const contractHolder: string = "CDCART6WRSM2K4CKOAOB5YKUVBSJ6KLOVS7ZEJHA4OAQ2FXX7JOHLXIP";

    const simBalance: bigint = await simTx(new Contract(usdxUsdcPool), "balance", [
      new Address(contractHolder).toScVal(),
    ])
      .then((sim) => scValToBigInt(sim.result!.retval));

    const result: IBalanceResult = await sdk.balance(usdxUsdcPool, contractHolder);
    assertEquals(result.balance, simBalance);
  });
});

describe("Test method 'balances", () => {
  let sdk: StellarAssetsSdk;

  beforeAll(() => {
    sdk = new StellarAssetsSdk({ rpcUrl });
  });

  it("should fetch the correct balances for multiple accounts and contracts", async () => {
    const tick: number = performance.now();
    const balances: IBalanceResult[] = await sdk.balances([{
      contractIds: [XlmContract.contractId(), UsdcContract.toString()],
      addresses: [account.accountId(), XlmContract.contractId(), UsdcContract.toString()],
    }]);
    const tock: number = performance.now();
    console.log(`Fetching 6 balances took: ${(tock - tick).toFixed(2)}ms`);

    for (const { contract, address, balance, trustLine } of balances) {
      const simBalance: bigint = await simTx(new Contract(contract), "balance", [
        new Address(address).toScVal(),
      ])
        .then((sim) => scValToBigInt(sim.result!.retval));

      assertEquals(simBalance, trustLine ? trustLine.balance : balance);
    }
  });
});
