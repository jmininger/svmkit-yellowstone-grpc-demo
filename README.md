# Solana Single Validator SPE with Yellowstone GRPC plugin

This example brings up a private cluster containing a single Solana validator running a Yellowstone
GRPC geyser.
## Dependencies for demo
- pulumi
- docker
- rustc + cargo
- gzip

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
% cd ../
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

```bash
% pulumi config set vixen:docker-payload vixen-server/vixen-server.tar.gz
% pulumi config set vixen:vixen-toml vixen-server/vixen.example.toml
```

5. Run `pulumi up`

```
% pulumi up
```

6. Port forward to the vixen docker container and subscribe to the stream
In one terminal:
```
./ssh-to-host 1 -L 9000:localhost:9000
```
in another:

```
./ssh-to-host 0 -L 8899:localhost:8899
```
Finally, in a third terminal:
```
cd vixen-client
cargo run --release
```
This program will run two tasks in parallel. The first simulates a client creating a token. The
second task subscribes to the vixen stream and prints out the updates it receives.

NOTE: It currently only runs a single mint, but we keep the stream open. Feel free to manually
run token options with `spl-token` on port 8899 to continue to see the updates in the stream. When
you are ready to exit the stream simply hit `ctrl-c` in the terminal running the vixen-client.

8. (Optional) Tear down the example

```bash
% pulumi down
```
