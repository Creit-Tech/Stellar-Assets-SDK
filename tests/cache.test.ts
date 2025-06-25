import { beforeEach, describe, it } from "@std/testing/bdd";
import { assertSpyCallAsync, assertSpyCalls, spy, stub } from "@std/testing/mock";
import { Asset, Networks, type rpc } from "@stellar/stellar-sdk";
import { StellarAssetsSdk } from "../src/sdk.ts";
import { assertExists } from "@std/assert";
import { assertEquals } from "@std/assert/equals";

describe("Test the assets cache logic", () => {
  let sdk: StellarAssetsSdk;

  beforeEach(() => {
    sdk = new StellarAssetsSdk({
      rpcUrl: "https://mainnet.sorobanrpc.com",
      networkPassphrase: Networks.PUBLIC
    });
  });

  it('should fetch the network if is undefined, after is set it should skip that', async () => {
    sdk.networkPassphrase = undefined;
    const mock = stub(
      sdk.rpc,
      "getNetwork",
      () => Promise.resolve({
        passphrase: Networks.PUBLIC,
        protocolVersion: '22'
      } satisfies rpc.Api.GetNetworkResponse),
    );

    await sdk.cacheAssets([Asset.native().contractId(Networks.PUBLIC)]);
    await sdk.cacheAssets([Asset.native().contractId(Networks.PUBLIC)]);

    assertSpyCallAsync(
      mock,
      0,
      {
        returned: {
          passphrase: Networks.PUBLIC,
          protocolVersion: '22'
        } satisfies rpc.Api.GetNetworkResponse
      }
    );
    assertSpyCalls(mock, 1);
  });

  it("should cache the native asset (XLM)", async () => {
    const id: string = Asset.native().contractId(Networks.PUBLIC);
    await sdk.cacheAssets([id]);
    assertExists(sdk.cachedAssets.get(id));
  });

  it("should cache a non-native classic asset", async () => {
    const id: string = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"; // USDC
    stub(
      sdk.routerSdk,
      "simResult",
      () => Promise.resolve(["USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"]),
    );
    await sdk.cacheAssets([id]);
    assertExists(sdk.cachedAssets.get(id));
  });

  it("should throw an error if the contract is trying to impersonate a classic stellar asset", async () => {
    const id: string = "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV"; // EURC id
    stub(
      sdk.routerSdk,
      "simResult",
      () => Promise.resolve(["USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"]),
    );

    await sdk.cacheAssets([id])
      .catch((err) => {
        assertEquals(
          "This asset is not the real stellar classic asset",
          err.message,
        );
      });
  });

  it("should cache a soroban asset", async () => {
    const id: string = "CA73MQDXDHT7Z37KIWP5BCRGAKOXDK2FLR3OPVKNUJUEHK5SWL74SE4K"; // USDC/USDx
    stub(
      sdk.routerSdk,
      "simResult",
      () => Promise.resolve(["Pool Share Token"]),
    );
    await sdk.cacheAssets([id]);
    assertExists(sdk.cachedAssets.get(id));
  });

  it('should cache a soroban asset even if it has ":" in the name', async () => {
    const id: string = "CA73MQDXDHT7Z37KIWP5BCRGAKOXDK2FLR3OPVKNUJUEHK5SWL74SE4K"; // USDC/USDx
    stub(sdk.routerSdk, "simResult", () => Promise.resolve(["USDC/USDx: Stableswap pool"]));
    await sdk.cacheAssets([id]);
    assertExists(sdk.cachedAssets.get(id));
  });

  it('should skip the `cacheAssets` logic if all assets are already cached', async () => {
    const id: string = Asset.native().contractId(Networks.PUBLIC);
    const simSpy = spy(sdk.routerSdk, 'simResult');
    await sdk.cacheAssets([id]);
    assertSpyCalls(simSpy, 0);
  });
});
