import { indexer, type Viewer } from "envio";

// Viewers are keyed by lowercase address so the frontend can look them up without
// worrying about checksum casing.
async function loadViewer(
  context: { Viewer: { get: (id: string) => Promise<Viewer | undefined> } },
  address: string,
): Promise<Viewer> {
  const id = address.toLowerCase();
  return (
    (await context.Viewer.get(id)) ?? {
      id,
      address,
      meterKey: undefined,
      totalDeposited: 0n,
      totalCharged: 0n,
      totalWithdrawn: 0n,
      withdrawAvailableAt: undefined,
    }
  );
}

indexer.onEvent({ contract: "FairStream", event: "Deposited" }, async ({ event, context }) => {
  const viewer = await loadViewer(context, event.params.viewer);
  context.Viewer.set({ ...viewer, totalDeposited: viewer.totalDeposited + event.params.amount });
});

indexer.onEvent({ contract: "FairStream", event: "MeterKeySet" }, async ({ event, context }) => {
  const viewer = await loadViewer(context, event.params.viewer);
  context.Viewer.set({ ...viewer, meterKey: event.params.key });
});

indexer.onEvent(
  {
    contract: "FairStream",
    event: "SessionSettled",
    fields: { block: ["timestamp"], transaction: ["hash"] },
  },
  async ({ event, context }) => {
    const viewer = await loadViewer(context, event.params.viewer);
    context.Viewer.set({ ...viewer, totalCharged: viewer.totalCharged + event.params.charged });

    context.Viewing.set({
      id: event.params.sessionId,
      viewer_id: viewer.id,
      sessionId: event.params.sessionId,
      requested: event.params.requested,
      charged: event.params.charged,
      timestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
    });
  },
);

indexer.onEvent({ contract: "FairStream", event: "WithdrawRequested" }, async ({ event, context }) => {
  const viewer = await loadViewer(context, event.params.viewer);
  context.Viewer.set({ ...viewer, withdrawAvailableAt: event.params.availableAt });
});

indexer.onEvent({ contract: "FairStream", event: "Withdrawn" }, async ({ event, context }) => {
  const viewer = await loadViewer(context, event.params.viewer);
  context.Viewer.set({
    ...viewer,
    totalWithdrawn: viewer.totalWithdrawn + event.params.amount,
    withdrawAvailableAt: undefined,
  });
});
