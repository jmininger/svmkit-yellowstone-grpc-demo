import * as fs from "fs";

// Make sure we grab the ubuntu 22 version of the release so that it works on our machine
const assetName =
  "yellowstone-grpc-geyser-release22-x86_64-unknown-linux-gnu.tar.bz2";
const geyserVersion = "v6.0.0+solana.2.2.1";
const releaseUrl = `https://github.com/rpcpool/yellowstone-grpc/releases/download/${geyserVersion}/${assetName}`;

const CONFIG_DIR = "/home/sol";
export const GRPC_PLUGIN_DIR = `${CONFIG_DIR}/yellowstone-grpc-geyser-release`;
export const GRPC_CONFIG_PATH = `${CONFIG_DIR}/grpc_config.json`;

export const geyser_config = fs.readFileSync(
  "./dragonmouth_config.json",
  "utf8",
);

export const geyser_setup_script_content = `
# Download yellowstone-grpc geyser plugin
set -e  # Exit on error

# Redirect all output to a log file for debugging
# exec > /var/log/userdata.log 2>&1
# echo "Starting UserData script at $(date)"

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
if [ ! -f ${GRPC_PLUGIN_DIR}/lib/libyellowstone_grpc_geyser.so ]; then
    echo "Binary not found after extraction"
    exit 1
fi

# Clean up
rm /tmp/yellowstone-grpc.tar.bz2

# Set execute permissions
chmod +x ${GRPC_PLUGIN_DIR}

cat << 'EOF' > ${GRPC_CONFIG_PATH}
${geyser_config}
EOF
`;
