import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import * as fs from "fs";

const config = new pulumi.Config("yellowstone");
export const GRPC_PORT = config.getNumber("grpc-port") ?? 10000;

// Make sure we grab the ubuntu 22 version of the release so that it works on our machine
const assetName =
  "yellowstone-grpc-geyser-release22-x86_64-unknown-linux-gnu.tar.bz2";
const geyserVersion = "v6.0.0+solana.2.2.1";
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
    `yellowstone-config.json currently indicates that the libpath is set to ${yCfgJson["libpath"]}, but its true path on the validator is ${GRPC_PLUGIN_PATH}. Please update the libpath in yellowstone-config.json to match the true path on the validator.`,
  );
  process.exit(1);
}
// if (yCfgJson["port"] !== GRPC_PORT) {
//   console.error(
//     `yellowstone-config.json currently indicates that the port is set to ${yCfgJson["port"]}, but its true port on the validator is ${GRPC_PORT}. Please update the port in yellowstone-config.json to match the true port on the validator.`,
//   );
//   process.exit(1);
// }

// TODO: Port should be a config
export const geyserSetupScriptContent = `
# Download yellowstone-grpc geyser plugin
set -e  # Exit on error

# Redirect all output to a log file for debugging
exec > /var/log/userdata.log 2>&1
echo "Starting UserData script at $(date)"

# Update package list and install dependencies
apt-get update
apt-get install -y wget tar bzip2

# Download the release
wget -q "${releaseUrl}" -O /tmp/yellowstone-grpc.tar.bz2
if [ $? -ne 0 ]; then
    echo "Failed to download release"
    exit 1
fi

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

cat << 'EOF' > ${GRPC_CONFIG_PATH}
${yellowstoneConfig}
EOF
`;

export function allowGrpcPort(connection: any, deps: any) : any {
    return new remote.Command("grpc_firewall", {
      connection,
      create: `sudo ufw allow ${GRPC_PORT}/tcp`
  }, {dependsOn: deps});
}
