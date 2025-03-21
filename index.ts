import * as pulumi from "@pulumi/pulumi";
import * as svmkit from "@svmkit/pulumi-svmkit";

const solanaConfig = new pulumi.Config("solana");
const tunerConfig = new pulumi.Config("tuner");

// AWS-specific resources are created inside.
import { sshKey, instance, agaveVersion , pluginPath} from "./aws";

// Add these constants near the top of the file, after the imports
const RPC_PORT = 8899;
const GOSSIP_PORT = 8001;
const FAUCET_PORT = 9900;
const AGAVE_VERSION = `${agaveVersion}-1`;

// Create some keys for this validator to use.
const validatorKey = new svmkit.KeyPair("validator-key");
const voteAccountKey = new svmkit.KeyPair("vote-account-key");
const faucetKey = new svmkit.KeyPair("faucet-key");
const treasuryKey = new svmkit.KeyPair("treasury-key");
const stakeAccountKey = new svmkit.KeyPair("stake-account-key");

// Point pulumi-svmkit at the AWS EC2 instance's SSH connection.
const connection = {
  host: instance.publicDns,
  user: "admin",
  privateKey: sshKey.privateKeyOpenssh,
};

// Add the genesis configuration before the Agave instance
const genesis = new svmkit.genesis.Solana(
    "genesis",
    {
        connection,
        version: AGAVE_VERSION,
        flags: {
            bootstrapValidators: [{
                identityPubkey: validatorKey.publicKey,
                votePubkey: voteAccountKey.publicKey,
                stakePubkey: stakeAccountKey.publicKey,
            }],
            ledgerPath: "/home/sol/ledger",
            faucetPubkey: faucetKey.publicKey,
            bootstrapValidatorStakeLamports: 10000000000,  // 10 SOL
            enableWarmupEpochs: true,
            slotsPerEpoch: 8192,
        },
        primordial: [
            {
                pubkey: validatorKey.publicKey,
                lamports: 1000000000000,  // 1000 SOL
            },
            {
                pubkey: treasuryKey.publicKey,
                lamports: 100000000000000,  // 100000 SOL
            },
            {
                pubkey: faucetKey.publicKey,
                lamports: 1000000000000,  // 1000 SOL
            },
        ],
    },
    {
        dependsOn: [instance],
    }
);


const faucet = new svmkit.faucet.Faucet("bootstrap-faucet", { "connection": connection, "keypair": faucetKey.json, "flags": {}}, { "dependsOn": [genesis]})
// Create the environment configuration
const solEnv = {
    rpcURL: instance.privateIp.apply(
        (ip) => `http://${ip}:${RPC_PORT}`
    )
};

// Update the rpcFaucetAddress definition
const rpcFaucetAddress = instance.privateIp.apply(
    (ip) => `${ip}:${FAUCET_PORT}`
);

// Update the Agave instance configuration
const validator = new svmkit.validator.Agave(
  "validator",
  {
    connection,
    version: AGAVE_VERSION,
    environment: solEnv,
    startupPolicy: { "waitForRPCHealth": true },
    shutdownPolicy: { "force": true },
    keyPairs: {
      identity: validatorKey.json,
      voteAccount: voteAccountKey.json,
    },
    flags: {
      onlyKnownRPC: false,
      rpcPort: RPC_PORT,
      dynamicPortRange: "8002-8020",
      privateRPC: false,
      gossipPort: GOSSIP_PORT,
      rpcBindAddress: "0.0.0.0",
      walRecoveryMode: "skip_any_corrupted_record",
      limitLedgerSize: 50000000,
      blockProductionMethod: "central-scheduler",
      fullSnapshotIntervalSlots: 1000,
      noWaitForVoteToStartLeader: true,
      useSnapshotArchivesAtStartup: "when-newest",
      allowPrivateAddr: true,
      rpcFaucetAddress: rpcFaucetAddress,
      fullRpcAPI: true,
      noVoting: false,
      geyserPluginAlwaysEnabled: true,
      geyserPluginConfig: [`${pluginPath}/config.json`],
      // expectedGenesisHash: genesis.genesisHash,
      // extraFlags: [
      //   "--enable-extended-tx-metadata-storage",
      //   "--enable-rpc-transaction-history",
      // ]
    },
  },
  {
    dependsOn: [faucet],
  },
);

// Tuner setup
const tunerVariant =
    tunerConfig.get<svmkit.tuner.TunerVariant>("variant") ??
    svmkit.tuner.TunerVariant.Generic;

// Retrieve the default tuner parameters for that variant
const genericTunerParamsOutput = svmkit.tuner.getDefaultTunerParamsOutput({
  variant: tunerVariant,
});

// "Apply" those params so we can pass them to the Tuner constructor
const tunerParams = genericTunerParamsOutput.apply((p) => ({
  cpuGovernor: p.cpuGovernor,
  kernel: p.kernel,
  net: p.net,
  vm: p.vm,
  fs: p.fs,
}));


// Create the Tuner resource on the EC2 instance
const tuner = new svmkit.tuner.Tuner(
  "tuner",
  {
    connection,
    params: tunerParams,
  },
  {
    dependsOn: [instance],
  }
);

// Expose information required to SSH to the validator host.
export const nodes_name = ["instance"];
export const nodes_public_ip = [instance.publicIp];
export const nodes_private_key = [sshKey.privateKeyOpenssh];
export const tuner_params = tunerParams;
