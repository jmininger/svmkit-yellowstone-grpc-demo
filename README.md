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

3. Run `pulumi up`

```
% pulumi up
```

4. Access the GRPC via Port Forwarding

In the example, the deployed validator is running remotely, so you’ll need to forward the relevant ports to your local machine to test the GRPC geyser.

Forward the ports to your local machine:

```
% ./ssh-to-host 0 -L 10000:localhost:10000
```
You can now test the GRPC connection by connecting to `localhost:10000` from your local machine.
In this current example we require you to have `grpcurl` installed locally. You can install it by
running `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`. You must then download both
the `solana-storage.proto` and the `geyser.proto`
protobufs from the [Yellowstone repository](https://github.com/rpcpool/yellowstone-grpc/releases/tag/v6.0.0%2Bsolana.2.2.1) and place them in the current dir. Then you can run:
```bash
% grpcurl -proto geyser.proto -plaintext localhost:10000 geyser.Geyser/GetBlockHeight
```

5. (Optional) Tear down the example

```
% pulumi down
```
