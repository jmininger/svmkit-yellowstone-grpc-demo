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
% docker build -t vixen-server .
% docker save vixen-server:latest| gzip >> vixen-server.tar.gz
```
4. Set pulumi config
Use `pulumi config set <key:val>` to set the following configuration values:

| Name                       | Description                                                       | Default Value |
| :------------------------- | :---------------------------------------------------------------- |:------------- |
| aws:region                 | The AWS region to launch the cluster in.                          | us-east-1
| vixen:docker-payload       | The path to the vixen-server docker image tarball.                |
| vixen:vixen-toml           | The path to the vixen.toml file.                                  |
| vixen:vixen-port           | The port to run the vixen server on.                              | 9000
| validator:instanceType     | The AWS instance type to use for all of the nodes.                | t3.medium
| validator:instanceArch     | The AWS instance architecture type to use for the AMI lookup.     | x86_64
| yellowstone:grpc-port      | The port to run the yellowstone gRPC server on                    | 10000

5. Run `pulumi up`

```
% pulumi up
```

6. Port forward to the vixen docker container and subscribe to the stream
In one terminal:
```
./ssh-to-host 1 -L 9000:localhost:9000
```
Then in another terminal, using grpcurl:
(assumes the `grpcurl` tool is installed and that the vixen stream is running on port 9000)
```
grpcurl -plaintext -d '{"program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}' 127.0.0.1:9000 vixen.stream.ProgramStreams/Subscribe
```

7. Create a token
Connect to the remote solana validator. We can port forward to the solana validator and then use the
`spl-token` cli if the local solana cli config is set to use localhost:8899
```
./ssh-to-host 0 -L 8899:localhost:8899
```
Then in another terminal, use the `spl-token` cli to create a token
```
solana faucet airdrop 100
spl-token create-token
```
You should see the token mint address in the stream in the vixen terminal

8. (Optional) Tear down the example

```bash
% pulumi down
```
