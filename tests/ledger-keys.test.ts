import { describe, it } from "@std/testing/bdd";
import { Address, Asset, Contract, Networks, type rpc, xdr } from "@stellar/stellar-sdk";
import { generateBalanceLedgerKeys, parseBalanceLedgerKeys } from "../src/utils.ts";
import { assertEquals } from "@std/assert";
import type { IBalanceResult } from "../src/types.ts";

describe("Test `generateBalanceLedgerKeys` function.", () => {
  it("should correctly generate an account ledger key for a G account and a native asset", () => {
    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      networks: Networks.PUBLIC,
      assets: [Asset.native()],
      targets: [new Address("GALAXYVOIDAOPZTDLHILAJQKCVVFMD4IKLXLSZV5YHO7VY74IWZILUTO")],
    });

    assertEquals(ledgerKeys[0].switch().name, "account");
  });

  it("should correctly generate a contract data key for a C account and a native asset", () => {
    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      networks: Networks.PUBLIC,
      assets: [Asset.native()],
      targets: [new Address("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA")],
    });

    assertEquals(ledgerKeys[0].switch().name, "contractData");
  });

  it("should correctly generate a trust line ledger key for a G account and a non-native classic asset", () => {
    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      networks: Networks.PUBLIC,
      assets: [new Asset("TEST", "GALAXYVOIDAOPZTDLHILAJQKCVVFMD4IKLXLSZV5YHO7VY74IWZILUTO")],
      targets: [new Address("GALAXYVOIDAOPZTDLHILAJQKCVVFMD4IKLXLSZV5YHO7VY74IWZILUTO")],
    });

    assertEquals(ledgerKeys[0].switch().name, "trustline");
  });

  it("should correctly generate a contract data ledger key for a C account and a non-native classic asset", () => {
    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      networks: Networks.PUBLIC,
      assets: [new Asset("TEST", "GALAXYVOIDAOPZTDLHILAJQKCVVFMD4IKLXLSZV5YHO7VY74IWZILUTO")],
      targets: [new Address("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA")],
    });

    assertEquals(ledgerKeys[0].switch().name, "contractData");
  });

  it("should correctly generate contract data ledger keys for both G accounts and C accounts for soroban assets", () => {
    const ledgerKeys: xdr.LedgerKey[] = generateBalanceLedgerKeys({
      networks: Networks.PUBLIC,
      assets: [new Contract("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA")],
      targets: [
        new Address("GALAXYVOIDAOPZTDLHILAJQKCVVFMD4IKLXLSZV5YHO7VY74IWZILUTO"),
        new Address("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"),
      ],
    });

    assertEquals(ledgerKeys[0].switch().name, "contractData");
    assertEquals(ledgerKeys[1].switch().name, "contractData");
  });
});

describe("Test `parseBalanceLedgerKeys` function.", () => {
  it("should correctly generate the XLM balance result for a G account that does not have liabilities", () => {
    const accountEntry: rpc.Api.LedgerEntryResult = {
      val: xdr.LedgerEntryData.account(
        xdr.AccountEntry.fromXDR(
          "AAAAAExSZ7DJVwTOYoUxaaQmy30CVKXvy7XUemF+yOLUaooUAAAAAcFfs7YDA8ksAAABHAAAAAoAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAMAAAAAA28WGgAAAABoU2YJ",
          "base64",
        ),
      ),
      key: xdr.LedgerKey.fromXDR("AAAAAAAAAAAWC+KuQMDn5mNZ0LAmChVqVg+IUu65Zr3B3frj/EWyhQ==", "base64"),
    };

    const parsedBalances: IBalanceResult[] = parseBalanceLedgerKeys({
      cachedAssets: new Map<string, Asset | Contract>(),
      entries: [accountEntry],
      network: Networks.PUBLIC,
    });

    assertEquals(parsedBalances[0].address, "GBGFEZ5QZFLQJTTCQUYWTJBGZN6QEVFF57F3LVD2MF7MRYWUNKFBJWIV");
    assertEquals(parsedBalances[0].contract, Asset.native().contractId(Networks.PUBLIC));
    assertEquals(parsedBalances[0].balance, 7479241910n);
    assertEquals(parsedBalances[0].isClassic, true);
    assertEquals(parsedBalances[0].trustLine, { balance: 7539241910n, buying: 0n, selling: 0n });
  });

  it("should correctly generate the XLM balance result for a G account with selling liabilities", () => {
    const accountEntry: rpc.Api.LedgerEntryResult = {
      val: xdr.LedgerEntryData.account(
        xdr.AccountEntry.fromXDR(
          "AAAAAH3bLw+oKfE+LsWT89EUhRS/fiYSyqUHsiSieu7v8pi5AAAAKggR77AC1HM4ACW8VAAAAAcAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAEAAAAAAAAAAAAAACn8JjAJAAAAAgAAAAAAAAAAAAAAAAAAAAMAAAAAA3AwMQAAAABoWamA",
          "base64",
        ),
      ),
      key: xdr.LedgerKey.fromXDR("AAAAAAAAAAAWC+KuQMDn5mNZ0LAmChVqVg+IUu65Zr3B3frj/EWyhQ==", "base64"),
    };

    const parsedBalances: IBalanceResult[] = parseBalanceLedgerKeys({
      cachedAssets: new Map<string, Asset | Contract>(),
      entries: [accountEntry],
      network: Networks.PUBLIC,
    });

    assertEquals(parsedBalances[0].balance, 154999399n);
    assertEquals(parsedBalances[0].isClassic, true);
    assertEquals(parsedBalances[0].trustLine, {
      balance: 180524019632n,
      buying: 0n,
      selling: 180324020233n,
    });
  });

  it("should correctly generate the USDC balance result for a G account with and without selling liabilities", () => {
    const withoutSelling: rpc.Api.LedgerEntryResult = {
      val: xdr.LedgerEntryData.trustline(
        xdr.TrustLineEntry.fromXDR(
          "AAAAAExSZ7DJVwTOYoUxaaQmy30CVKXvy7XUemF+yOLUaooUAAAAAVVTREMAAAAAO5kROA7+mIugqJAOsc/kTzZvfb6Ua+0HckD39iTfFcUAAAAEqG1Rh3//////////AAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAA",
          "base64",
        ),
      ),
      key: xdr.LedgerKey.fromXDR("AAAAAAAAAAAWC+KuQMDn5mNZ0LAmChVqVg+IUu65Zr3B3frj/EWyhQ==", "base64"),
    };

    const withSelling: rpc.Api.LedgerEntryResult = {
      val: xdr.LedgerEntryData.trustline(
        xdr.TrustLineEntry.fromXDR(
          "AAAAADruSUMEodmVSpg2Yl3HIZ4Pl6BWo6HR7o5j6Ab0dDZUAAAAAVVTREMAAAAAO5kROA7+mIugqJAOsc/kTzZvfb6Ua+0HckD39iTfFcUAAAEkE6WAQX//////////AAAAAQAAAAEAAAB1GYcxnAAAAHO6S0RKAAAAAA==",
          "base64",
        ),
      ),
      key: xdr.LedgerKey.fromXDR("AAAAAAAAAAAWC+KuQMDn5mNZ0LAmChVqVg+IUu65Zr3B3frj/EWyhQ==", "base64"),
    };

    const parsedBalances: IBalanceResult[] = parseBalanceLedgerKeys({
      cachedAssets: new Map<string, Asset | Contract>(),
      entries: [withoutSelling, withSelling],
      network: Networks.PUBLIC,
    });

    assertEquals(parsedBalances[0].balance, 20005605767n);
    assertEquals(parsedBalances[0].trustLine!.selling, 0n);
    assertEquals(parsedBalances[0].trustLine!.buying, 0n);
    assertEquals(parsedBalances[0].isClassic, true);

    assertEquals(parsedBalances[1].balance, 1254460063809n - 497046733898n);
    assertEquals(parsedBalances[1].trustLine!.selling, 497046733898n);
    assertEquals(parsedBalances[1].trustLine!.buying, 502939464092n);
    assertEquals(parsedBalances[1].isClassic, true);
  });

  it("should correctly generate the USDC balance result for a contract ", () => {
    const contractDataEntry: rpc.Api.LedgerEntryResult = {
      val: xdr.LedgerEntryData.contractData(
        xdr.ContractDataEntry.fromXDR(
          "AAAAAAAAAAGt785ZruUpaPdgYdSUwlJbdWWfpClqZfSZ7ynlZHfklgAAABAAAAABAAAAAgAAAA8AAAAHQmFsYW5jZQAAAAASAAAAAXaQPGRDAbc6QF0OvETM1CdzVHsgJAW8rKkpp7lrotIZAAAAAQAAABEAAAABAAAAAwAAAA8AAAAGYW1vdW50AAAAAAAKAAAAAAAAAAAAAAAAWEsikwAAAA8AAAAKYXV0aG9yaXplZAAAAAAAAAAAAAEAAAAPAAAACGNsYXdiYWNrAAAAAAAAAAA=",
          "base64",
        ),
      ),
      key: xdr.LedgerKey.fromXDR(
        "AAAABgAAAAGt785ZruUpaPdgYdSUwlJbdWWfpClqZfSZ7ynlZHfklgAAABAAAAABAAAAAgAAAA8AAAAHQmFsYW5jZQAAAAASAAAAAXaQPGRDAbc6QF0OvETM1CdzVHsgJAW8rKkpp7lrotIZAAAAAQ==",
        "base64",
      ),
    };

    const USDC: Asset = new Asset("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
    const cachedAssets = new Map<string, Asset | Contract>();
    cachedAssets.set(USDC.contractId(Networks.PUBLIC), USDC);
    const parsedBalances: IBalanceResult[] = parseBalanceLedgerKeys({
      cachedAssets: cachedAssets,
      entries: [contractDataEntry],
      network: Networks.PUBLIC,
    });

    assertEquals(parsedBalances[0].address, "CB3JAPDEIMA3OOSALUHLYRGM2QTXGVD3EASALPFMVEU2POLLULJBT2XN");
    assertEquals(parsedBalances[0].contract, "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75");
    assertEquals(parsedBalances[0].balance, 1481319059n);
    assertEquals(parsedBalances[0].isClassic, true);
    assertEquals(parsedBalances[0].trustLine, null);
  });
});
