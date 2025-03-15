import { beforeEach, describe, it } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { Asset, Networks, xdr } from "@stellar/stellar-sdk";
import { StellarAssetsSdk } from "../src/stellar-assets-sdk.ts";
import { assertExists } from "@std/assert";
import { assertEquals } from "@std/assert/equals";

describe("Test the assets cache logic", () => {
  const rpcUrl: string = "https://mainnet.sorobanrpc.com";
  let sdk: StellarAssetsSdk;

  beforeEach(() => {
    sdk = new StellarAssetsSdk({ rpcUrl });
  });

  it("should cache the native asset (XLM)", async () => {
    const id: string = Asset.native().contractId(Networks.PUBLIC);
    await sdk.cacheAsset(id);
    assertExists(sdk.cachedAssets.get(id));
  });

  it("should cache a non-native classic asset", async () => {
    const id: string = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"; // USDC
    await sdk.cacheAsset(id);
    assertExists(sdk.cachedAssets.get(id));
  });

  it("should throw an error if the contract is trying to impersonate a classic stellar asset", async () => {
    const id: string = "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV"; // EURC id
    stub(sdk, "simulate", () =>
      Promise.resolve({
        result: {
          retval: xdr.ScVal.scvString(
            "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          ),
        },
        // deno-lint-ignore no-explicit-any
      }) as any);

    await sdk.cacheAsset(id)
      .catch((err) => {
        assertEquals(
          "This asset is not the real stellar classic asset",
          err.message,
        );
      });
  });

  it("should cache a soroban asset", async () => {
    const id: string = "CA73MQDXDHT7Z37KIWP5BCRGAKOXDK2FLR3OPVKNUJUEHK5SWL74SE4K"; // USDC/USDx
    await sdk.cacheAsset(id);
    assertExists(sdk.cachedAssets.get(id));
  });

  it('should cache a soroban asset even if it has ":" in the name', async () => {
    const id: string = "CA73MQDXDHT7Z37KIWP5BCRGAKOXDK2FLR3OPVKNUJUEHK5SWL74SE4K"; // USDC/USDx
    stub(sdk, "simulate", () =>
      Promise.resolve({
        result: { retval: xdr.ScVal.scvString("USDC/USDx: Stableswap pool") },
        // deno-lint-ignore no-explicit-any
      }) as any);
    await sdk.cacheAsset(id);
    assertExists(sdk.cachedAssets.get(id));
  });
});
