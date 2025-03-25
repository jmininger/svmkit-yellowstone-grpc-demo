import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeRequestFilterAccountsFilter,
  SubscribeUpdateAccountInfo,
} from "@triton-one/yellowstone-grpc";
import {
  STAKE_PROGRAM_ADDRESS,
  decodeStakeStateAccount,
} from '@solana-program/stake';
import bs58 from 'bs58';

const ACCOUNT_PK = "HFVLaumZ8XRaxNvr2srUSWinnwoaatwEbb1aEDAxoZQg";

const serverEndpoint = process.env.SERVER_ENDPOINT || "http://localhost:10000";
// const token = process.env.TOKEN || "<your-token>";

const client = new Client(serverEndpoint, undefined, undefined);

const version = await client.getVersion();
console.log("Version: ", version);
// const latestBlockHeight = await client.getBlockHeight(CommitmentLevel.FINALIZED);
// console.log("Latest Block Height: ", latestBlockHeight);

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
    // const accountPk = accountInfo.account
    const accountInfo = data.account;
  
    const address = bs58.encode(accountInfo.account.pubkey);
    console.log("Account update for StakeAccount: ", address);

    const sa = decodeStakeStateAccount(accountInfo.account)
    // Only show updates if its a delegation or undelegation
    const state = sa.data.state
    if (state.__kind === 'Stake') {
      const [, stake] = state.fields; // Second field is `Stake`
      console.log(stake);
    } else {
      console.log('Not Active');
    }
  }
});

const request: SubscribeRequest = {
  accounts: {
    client: {
      owner: [],
      account: [ACCOUNT_PK],
      filters: [], // You can add additional filters here if needed
    },
  },
  slots: {},
  transactions: {},
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  commitment: CommitmentLevel.CONFIRMED,
  accountsDataSlice: [],
  ping: undefined,
};

// Send subscribe request
await new Promise<void>((resolve, reject) => {
  stream.write(request, (err: Error | null) => {
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
