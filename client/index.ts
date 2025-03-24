import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeRequestFilterAccountsFilter,
} from "@triton-one/yellowstone-grpc";

const ACCOUNT_PK = "AVyADfkTrCpL49w2hp3hy7oLzY4iijsMxeQZEdj8mRDs"

const serverEndpoint = process.env.SERVER_ENDPOINT || "http://localhost:10000";
// const token = process.env.TOKEN || "<your-token>";

const client = new Client(serverEndpoint, undefined, undefined);
const version = await client.getVersion();
console.log("Version: ", version)
// grpc.runClient(client).then(console.log).catch(console.error);

// Subscribe for events
const stream = await client.subscribe();

// Create `error` / `end` handler
const streamClosed = new Promise<void>((resolve, reject) => {
  stream.on("error", (error) => {
    reject(error);
    stream.end();
  });
  stream.on("end", () => {
    resolve();
  });
  stream.on("close", () => {
    resolve();
  });
});

// Handle account updates
stream.on("data", (data) => {
  if (data.account) {
    const accountInfo = data.account;
    console.log('Account Update:', accountInfo);
  }
});

const request: SubscribeRequest = {
    accounts: {
      client: {
        owner: ["Stake11111111111111111111111111111111111111"],
        account: [ACCOUNT_PK],
        filters: [], // You can add additional filters here if needed
      }
    },
    slots: {},
    transactions: {},
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    commitment: undefined,
    accountsDataSlice: [],
    ping: undefined,
  };

  // Send subscribe request
await new Promise<void>((resolve, reject) => {
  stream.write(request, (err: Error|null) => {
    if (err === null || err === undefined) {
      resolve();
    } else {
      reject(err);
    }
  });
}).catch((reason) => {
  console.error(reason);
  throw reason;
});

await streamClosed;
