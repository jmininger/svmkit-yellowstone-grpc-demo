# Solana Single Validator SPE with Yellowstone GRPC plugin

This example brings up a private cluster containing a single Solana validator running a Yellowstone
GRPC geyser.

## Running the Example

0. Have `pulumi` installed, logged in to wherever you're storing state, and configured to work with AWS.

- https://www.pulumi.com/docs/iac/cli/commands/pulumi_login/
- https://github.com/pulumi/pulumi-aws?tab=readme-ov-file#configuration

1. Run `pulumi install`; this will install all of the required pieces for this example.

```
% pulumi install
```

2. Create and select a Pulumi stack

```
% pulumi stack init dev-node-grpc
```

3. Build the vixen-stream docker image

```
% cd vixen-server
% docker build --env-file .env -t vixen-server .
% docker save vixen-server:latest| gzip >> vixen-server.tar.gz
```

4. Run `pulumi up`

```
% pulumi up
```

5. Subscribe to the stream
```
grpcurl -plaintext -d '{"program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}' 127.0.0.1:3030 vixen.stream.ProgramStreams/Subscribe
```
(assumes the `grpcurl` tool is installed and that the vixen stream is running on port 3030)

5. Create a token
In another terminal, use the `spl-token` cli to create a token
```
spl-token create-token
```
You should see the token mint address in the stream


6. (Optional) Tear down the example

```bash
% pulumi down
```
