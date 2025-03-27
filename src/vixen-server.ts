import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import { externalSg, internalSg, VIXEN_PORT } from "./network";

const nodeConfig = new pulumi.Config("vixen");
const instanceType = nodeConfig.get("instanceType") ?? "t3.medium";
const instanceArch = nodeConfig.get("instanceArch") ?? "x86_64";

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
apt-get install -y docker.
systemctl start docker
systemctl enable docker
# Pull and run the Vixen Docker image
docker pull your-vixen-image:latest
docker run -d -p ${VIXEN_PORT}:${VIXEN_PORT} your-vixen-image:latest
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