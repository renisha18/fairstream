import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers } from "envio";

const [viewerAddress, meterKey] = TestHelpers.Addresses.mockAddresses;
const SESSION = "0xc263d6d926048089e9fdb5ee9e30da81629fdf17bda4219bf8e63eb176b4d219";
const TX = "0x60797763d9b6a049b675ef2931c94feed1dbe34fffb643b7e0c563204b47eb8a";

describe("FairStream handlers", () => {
  it("tracks deposits, a settled viewing and a withdrawal", async (t) => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "FairStream", event: "Deposited", params: { viewer: viewerAddress, amount: 5_000_000n } },
            { contract: "FairStream", event: "MeterKeySet", params: { viewer: viewerAddress, key: meterKey } },
            {
              contract: "FairStream",
              event: "SessionSettled",
              params: { viewer: viewerAddress, sessionId: SESSION, requested: 50_000n, charged: 40_000n },
              block: { timestamp: 1_791_896_100 },
              // The handler selects `hash` with its own `fields` option, which the test typings don't see.
              transaction: { hash: TX } as never,
            },
            { contract: "FairStream", event: "WithdrawRequested", params: { viewer: viewerAddress, availableAt: 1_791_896_220n } },
            { contract: "FairStream", event: "Withdrawn", params: { viewer: viewerAddress, amount: 4_960_000n } },
          ],
        },
      },
    });

    const viewer = await indexer.Viewer.getOrThrow(viewerAddress!.toLowerCase());
    t.expect(viewer.totalDeposited).toBe(5_000_000n);
    t.expect(viewer.totalCharged).toBe(40_000n);
    t.expect(viewer.totalWithdrawn).toBe(4_960_000n);
    t.expect(viewer.meterKey).toBe(meterKey);
    t.expect(viewer.withdrawAvailableAt).toBeUndefined();

    const viewing = await indexer.Viewing.getOrThrow(SESSION);
    t.expect(viewing.viewer_id).toBe(viewer.id);
    t.expect(viewing.requested).toBe(50_000n);
    t.expect(viewing.charged).toBe(40_000n);
    t.expect(viewing.timestamp).toBe(1_791_896_100);
    t.expect(viewing.transactionHash).toBe(TX);
  });
});
