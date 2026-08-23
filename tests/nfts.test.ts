import { beforeEach, describe, it } from "@std/testing/bdd";
import { StellarAssetsSdk } from '../src/sdk.ts';
import { Networks } from "@stellar/stellar-sdk";
import { assertEquals } from "@std/assert";

describe("Test the logic around SEP-0050 Assets", (): void => {
  let sdk: StellarAssetsSdk;
  let nft: string = 'CADCRH6BW3MIZBBE7JOVKROR2GBEG64TJDT5Y3EX3OOIWRDZOOT5XUHD';
  let account: string = 'GBGFEZ5QZFLQJTTCQUYWTJBGZN6QEVFF57F3LVD2MF7MRYWUNKFBJWIV'

  beforeEach((): void => {
    sdk = new StellarAssetsSdk({
      rpcUrl: "https://rpc.lightsail.network",
      networkPassphrase: Networks.PUBLIC,
    });
  });

  it('should fetch all the token ids an address owns', async (): Promise<void> => {
    const { balance } = await sdk.balance(nft, account);
    const nfts: number[] = await sdk.fetchOwnedNFTs(nft, account);
    assertEquals(balance.toString(), nfts.length.toString());
  });
});
