import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import * as fs from "fs";

const nodeConfig = new pulumi.Config("node");
const instanceType = nodeConfig.get("instanceType") ?? "t3.2xlarge";
const instanceArch = nodeConfig.get("instanceArch") ?? "x86_64";
export const agaveVersion = nodeConfig.get("agaveVersion") ?? "2.2.1";

// Define the grpc plugin release version and asset
const geyserVersion = "v6.0.0+solana.2.2.1";
// Make sure we grab the ubuntu 22 version of the release so that it works on our machine
const assetName = "yellowstone-grpc-geyser-release22-x86_64-unknown-linux-gnu.tar.bz2";
const releaseUrl = `https://github.com/rpcpool/yellowstone-grpc/releases/download/${geyserVersion}/${assetName}`;
export const pluginPath = "/home/sol"

const configContent = fs.readFileSync("./dragonmouth_config.json", "utf8");

// Setup a local SSH private key, stored inside Pulumi.
export const sshKey = new tls.PrivateKey("ssh-key", {
  algorithm: "ED25519",
});

const keyPair = new aws.ec2.KeyPair("keypair", {
  publicKey: sshKey.publicKeyOpenssh,
});

// Get AMI information on the latest Debian image inside AWS.
const ami = pulumi.output(
  aws.ec2.getAmi({
    filters: [
      {
        name: "name",
        values: ["debian-12-*"],
      },
      {
        name: "architecture",
        values: [instanceArch],
      },
    ],
    owners: ["136693071363"], // Debian
    mostRecent: true,
  }),
).id;

const stackName = pulumi.getStack();

const externalSg = new aws.ec2.SecurityGroup("external-access", {
    description: "Allow external SSH access to all of the nodes",
    ingress: [
        {
            protocol: "tcp",
            fromPort: 0,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
    egress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }
    ],
    tags: {
        Stack: stackName,
    }
});

const internalSg = new aws.ec2.SecurityGroup("internal-access", {
    description: "Permissive internal traffic",
    ingress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            self: true,
        },
    ],
    egress: [
        {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        }
    ],
    tags: {
        Stack: stackName,
    }
});

// Export the security groups so they can be used in other parts of your infrastructure
export const externalSecurityGroup = externalSg;
export const internalSecurityGroup = internalSg;

export const instance = new aws.ec2.Instance("instance", {
  ami,
  instanceType,
  keyName: keyPair.keyName,
  vpcSecurityGroupIds: [externalSecurityGroup.id, internalSecurityGroup.id],
  ebsBlockDevices: [
    {
      deviceName: "/dev/sdf",
      volumeSize: 100,
      volumeType: "gp3",
      iops: 5000,
    },
    {
      deviceName: "/dev/sdg",
      volumeSize: 204,
      volumeType: "gp3",
      iops: 5000,
    },
  ],
  userData: `#!/bin/bash
# Format the /dev/sdf and /dev/sdg devices with the ext4 filesystem.
mkfs -t ext4 /dev/sdf
mkfs -t ext4 /dev/sdg

# Create directories for Solana accounts and ledger data.
mkdir -p /home/sol/accounts
mkdir -p /home/sol/ledger

# Append entries to /etc/fstab to mount the devices and swap at boot.
cat <<EOF >> /etc/fstab
/dev/sdf	/home/sol/accounts	ext4	defaults	0	0
/dev/sdg	/home/sol/ledger	ext4	defaults	0	0
/swapfile none swap sw 0 0
EOF

# Setup swap space
fallocate -l {swap_size}M /swapfile
chmod 600 /swapfile
mkswap /swapfile

# Reload systemd manager configuration and mount all filesystems.
systemctl daemon-reload
mount -a
swapon -a

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
tar -xjvf /tmp/yellowstone-grpc.tar.bz2 -C ${pluginPath}
echo "GETTING BINARY"
echo "${pluginPath}"
if [ ! -f ${pluginPath}/yellowstone-grpc-geyser-release/lib/libyellowstone_grpc_geyser.so ]; then
    echo "Binary not found after extraction"
    exit 1
fi

# Clean up
rm /tmp/yellowstone-grpc.tar.bz2

# Set execute permissions
chmod +x ${pluginPath}/yellowstone-grpc-geyser-release

cat << 'EOF' > ${pluginPath}/config.json
${configContent}
EOF

`,
  tags: {
    Name: `${pulumi.getStack()}-validator`,
  },
});
