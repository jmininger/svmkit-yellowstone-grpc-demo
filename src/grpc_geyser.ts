import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import * as fs from "fs";
import { connection as validatorConnection } from "./validator";

const config = new pulumi.Config("yellowstone");
export const GRPC_PORT = config.getNumber("grpc-port") ?? 10000;

// Make sure we grab the ubuntu 22 version of the release so that it works on the machine
const assetName =
  "yellowstone-grpc-geyser-release22-x86_64-unknown-linux-gnu.tar.bz2";
const geyserVersion = "v5.0.1+solana.2.1.15";
const releaseUrl = `https://github.com/rpcpool/yellowstone-grpc/releases/download/${geyserVersion}/${assetName}`;

const CONFIG_DIR = "/home/sol";
const GRPC_PLUGIN_DIR = `${CONFIG_DIR}/yellowstone-grpc-geyser-release`;
const GRPC_PLUGIN_PATH = `${GRPC_PLUGIN_DIR}/lib/libyellowstone_grpc_geyser.so`;
export const GRPC_CONFIG_PATH = `${CONFIG_DIR}/grpc_config.json`;

const yellowstoneConfig = fs.readFileSync("./yellowstone-config.json", "utf8");

// Run some checks to make sure the yellowstone-config.json has a matching `libpath` to the
// one being set on the validator
var yCfgJson = JSON.parse(yellowstoneConfig);
if (yCfgJson["libpath"] !== GRPC_PLUGIN_PATH) {
  console.error(
    `yellowstone-config.json currently indicates that the libpath is set to ${yCfgJson["libpath"]}, but its true path on the validator is ${GRPC_PLUGIN_PATH} as per src/grpc_geyser.ts . Please update the libpath in yellowstone-config.json to match the true path on the validator.`,
  );
  process.exit(1);
}

// Run some checks to make sure the yellowstone-config.json has a matching `grpc address` to the
// one being exposed on the validator
const expectedAddress = `0.0.0.0:${GRPC_PORT}`;
const configAddress = yCfgJson["grpc"]["address"];

if (configAddress !== expectedAddress) {
  console.error(
    `yellowstone-config.json has grpc.address set to "${configAddress}", ` +
    `but it should be "${expectedAddress}" to match the validator's gRPC port. ` +
    `Please update "grpc.address" in yellowstone-config.json to "${expectedAddress}".`
  );
  process.exit(1);
}

export function allowGrpcPort(connection: any, deps: any) : any {
    return new remote.Command("grpc_firewall", {
      connection,
      create: `sudo ufw allow ${GRPC_PORT}/tcp`
  }, {dependsOn: deps});
}

export const geyserSetupScriptContent = `#!/bin/bash
# Download yellowstone-grpc geyser plugin
set -e  # Exit on error

# Update package list and install dependencies
sudo apt-get update
sudo apt-get install -y wget tar bzip2

# Download the release
wget -q "${releaseUrl}" -O /tmp/yellowstone-grpc.tar.bz2
if [ $? -ne 0 ]; then
    echo "Failed to download release"
    exit 1
fi

sudo mkdir -p ${CONFIG_DIR}
sudo chown admin:admin ${CONFIG_DIR}

# Extract the binary
tar -xjvf /tmp/yellowstone-grpc.tar.bz2 -C ${CONFIG_DIR}
if [ ! -f ${GRPC_PLUGIN_PATH} ]; then
    echo "Binary not found after extraction"
    exit 1
fi

# Clean up
rm /tmp/yellowstone-grpc.tar.bz2

# Set execute permissions
chmod +x ${GRPC_PLUGIN_DIR}
`;

export const installGeyser = new remote.Command("install-yellowstone-grpc", {
  connection: validatorConnection,
  create: geyserSetupScriptContent,
  triggers: [],
}, { dependsOn: [] });

// Copy the yellowstone-grpc config file to the validator
const configCopy = new remote.CopyFile("yellowstone-grpc-config-copy", {
  connection: validatorConnection,
  localPath: "./yellowstone-config.json",
  remotePath: GRPC_CONFIG_PATH,
}, { dependsOn: [installGeyser] });

