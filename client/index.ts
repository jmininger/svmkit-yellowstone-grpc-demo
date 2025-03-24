import Client from "@triton-one/yellowstone-grpc";

const serverEndpoint = process.env.SERVER_ENDPOINT || "http://localhost:10000";
// const token = process.env.TOKEN || "<your-token>";

const client = new Client(serverEndpoint, undefined, undefined);
const version = await client.getVersion();
console.log("Version: ", version)
// grpc.runClient(client).then(console.log).catch(console.error);
