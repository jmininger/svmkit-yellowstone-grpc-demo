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

5. (Optional) Tear down the example

```
% pulumi down
```
