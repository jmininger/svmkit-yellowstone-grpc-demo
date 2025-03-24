import Client from "@triton-one/yellowstone-grpc";

console.log("HELLO WORLD");
const serverEndpoint = process.env.SERVER_ENDPOINT || "https://default.rpcpool.com:443";
const token = process.env.TOKEN || "<your-token>";

// const client = new Client(serverEndpoint, token);
// grpc.runClient(client).then(console.log).catch(console.error);
