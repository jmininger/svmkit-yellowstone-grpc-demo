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

After succesfully deploying, run the following to get your stake account addres which you will need for a later part of this demo:
```bash
% pulumi stack output stake_account_key
```

4. Access the GRPC via Port Forwarding

In the example, the deployed validator is running remotely, so you’ll need to forward the relevant ports to your local machine to test the GRPC geyser.

Forward the ports to your local machine:

```bash
% ./ssh-to-host 0 -L 10000:localhost:10000
```
You can now test the GRPC connection by connecting to `localhost:10000` from your local machine.

5. Run the client demo

In another terminal, run the following:
```bash
% cd client
% npm install 
% STAKE_PK=$(pulumi stack output stake_account_key | jq -r .[] ) npm run client
```
This spins up a client that connects to the geyser and waits for updates to the stake account.

In the previous terminal (from step 4) enter the following:
```bash
% solana deactivate-stake <STAKE_ACCOUNT_FROM_STEP_3>
```
and watch in the other window as the client handles this change

6. (Optional) Tear down the example

```bash
% pulumi down
```
