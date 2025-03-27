import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import { externalSg, internalSg, VIXEN_PORT } from "./network";

const config = new pulumi.Config("vixen");
const instanceType = config.get("instanceType") ?? "t3.medium";
const instanceArch = config.get("instanceArch") ?? "x86_64";

// Setup a local SSH private key, stored inside Pulumi.
export const sshKey = new tls.PrivateKey("vixen-ssh-key", {
  algorithm: "ED25519",
});

const keyPair = new aws.ec2.KeyPair("vixen-keypair", {
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

// User data script to install Docker and run the container
const userData = `#!/bin/bash
# Update system and install Docker
apt-get update -y
apt-get install -y \
    gzip \
    docker.io

# Start and enable Docker service
systemctl start docker
systemctl enable docker

# Add admin user to docker group to run docker without sudo
usermod -aG docker admin

# Create directory for docker payload
mkdir -p /home/admin
chown admin:admin /home/admin
`;

export const vixenInstance = new aws.ec2.Instance("vixen-server", {
  ami,
  instanceType,
  keyName: keyPair.keyName,
  vpcSecurityGroupIds: [externalSg.id, internalSg.id],
  userData,
  tags: {
    Name: `${stackName}-vixen-server`,
  },
});

// Export the public IP of the instance
export const publicIp = vixenInstance.publicIp; 

// Set up source and target of the remote copy.
const from = config.require("docker-payload")!;
const archive = new pulumi.asset.FileArchive(from);
const to = "/home/admin/"

const connection = {
  host: vixenInstance.publicDns,
  user: "admin",
  privateKey: sshKey.privateKeyOpenssh,
};
// Copy the files to the remote.
const copy = new remote.CopyToRemote("copy", {
    connection,
    source: archive,
    remotePath: to,
});

const dockerRunCmd = `cd ${to} && \
    gunzip -c docker-payload.tar.gz | docker load && \
    docker run -d \
    -p ${VIXEN_PORT}:${VIXEN_PORT} \
    vixen-server:latest`;

const dockerRun = new remote.Command("docker-run", {
  connection,
  create: dockerRunCmd,
  triggers: [archive],
}, { dependsOn: copy });