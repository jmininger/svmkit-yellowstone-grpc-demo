import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import * as fs from "fs";
import * as toml from "toml";
import { externalSg, internalSg } from "./network";
import { instance } from "./aws";

const config = new pulumi.Config("vixen");
const instanceType = config.get("instanceType") ?? "t3.medium";
const instanceArch = config.get("instanceArch") ?? "x86_64";
const imgFrom = config.require("docker-payload")!;
const tomlFrom = config.require("vixen-toml")!;
const VIXEN_PORT = config.getNumber("vixen-port") ?? 9000;
const YELLOWSTONE_GRPC_PORT = config.getNumber("yellowstone-port") ?? 10000;

const grpcAddress = nodeInstance.publicIp.apply(ip => `${ip}:${YELLOWSTONE_GRPC_PORT}`);

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

interface VixenConfig {
  yellowstone?: {
    endpoint?: string;
  };
}

// TODO: Better way to do this
function readGrpcSocketSync(newEndpoint) {
  const fileContent = fs.readFileSync(tomlFrom, 'utf-8');
  const config = toml.parse(fileContent) as VixenConfig;
  config.yellowstone.endpoint = newEndpoint;
  const updatedToml = toml.stringify(config);
  const tmpobj = tmp.fileSync();
  console.log('File: ', tmpobj.name);
  console.log('Updated TOML: ', updatedToml);
  fs.writeFile(tmp, updatedToml, 'utf-8');
  return tmpobj.name;
}
const updatedToml = readGrpcSocketSync(grpcAddress);

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
export const vixenPublicIp = vixenInstance.publicIp;

// Set up source and target of the remote copy.
const archive = new pulumi.asset.FileArchive(imgFrom);
const imgTo = "/home/admin/"

const connection = {
  host: vixenInstance.publicDns,
  user: "admin",
  privateKey: sshKey.privateKeyOpenssh,
};
// Copy the files to the remote.
const dockerCopy = new remote.CopyToRemote("docker-image-copy", {
    connection,
    source: archive,
    remotePath: imgTo,
});


const configCopy = new remote.CopyFile("vixen-config-copy", {
  connection,
  localPath: updatedToml,
  remotePath: "/home/admin/Vixen.toml",
}, { dependsOn: dockerCopy });

const dockerRunCmd = `cd ${imgTo} && \
    gunzip -c vixen-server.tar.gz | docker load && \
    docker run -d \
    -e CONFIG_FILE=/home/admin/Vixen.toml \
    -p ${VIXEN_PORT}:${VIXEN_PORT} \
    vixen-server:latest`;

const dockerRun = new remote.Command("docker-run", {
  connection,
  create: dockerRunCmd,
  triggers: [archive],
}, { dependsOn: [dockerCopy, vixenInstance] });

