import * as pulumi from "@pulumi/pulumi";
import { remote, types } from "@pulumi/command";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import * as fs from "fs";
import * as tmp from "tmp";
import * as toml from "@iarna/toml";

import { externalSg, internalSg } from "./network";
import { instance as nodeInstance } from "./validator";

const config = new pulumi.Config("vixen");
const instanceType = config.get("instanceType") ?? "t3.medium";
const instanceArch = config.get("instanceArch") ?? "x86_64";
const imgFrom = config.require("docker-payload")!;
const tomlFrom = config.require("vixen-toml")!;
const VIXEN_PORT = config.getNumber("vixen-port") ?? 9000;
const YELLOWSTONE_GRPC_PORT = config.getNumber("yellowstone-port") ?? 10000;

const grpcAddress = nodeInstance.privateIp.apply(ip => `http://${ip}:${YELLOWSTONE_GRPC_PORT}`);

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

function readGrpcSocketSync(newEndpoint:string) : string{
  const fileContent: string = fs.readFileSync(tomlFrom, 'utf-8');
  const config: any = toml.parse(fileContent); // Using any since TOML config structure isn't strictly defined
  if (!config.yellowstone) {
      config.yellowstone = {};
  }
  config['yellowstone']['endpoint'] = newEndpoint;
  const updatedToml: string = toml.stringify(config);
  const tmpobj: tmp.FileResult = tmp.fileSync();
  fs.writeFileSync(tmpobj.name, updatedToml, 'utf-8');
  return tmpobj.name;
}
const updatedToml = grpcAddress.apply((addr) => readGrpcSocketSync(addr));


// User data script to install Docker and run the container
const userData = `#!/bin/bash
set -e  # Exit on error
# Redirect all output to a log file for debugging
exec > /var/log/userdata.log 2>&1
echo "Starting UserData script at $(date)"

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

touch /home/admin/userdata-done  # Marker file
echo "UserData completed at $(date)"
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

// Wait for the docker service to be ready by checking for a file
// This is only necessary bc the userData script actually runs in parallel to other
// pulumi cmds even though the other scripts are supposed to depend on it
const waitForDockerCmd = `until [ -f /home/admin/userdata-done ]; do sleep 1; done`;
const waitForDocker = new remote.Command("docker-wait", {
  connection,
  create: waitForDockerCmd,
  triggers: [],
}, { dependsOn: [vixenInstance ] });


const dockerRunCmd = `cd ${imgTo} && \
    gunzip -c vixen-server.tar.gz | docker load && \
    docker run -d \
    -e CONFIG_FILE=/config/Vixen.toml \
    -v /home/admin/Vixen.toml:/config/Vixen.toml \
    -p ${VIXEN_PORT}:${VIXEN_PORT} \
    vixen-server:latest`;

const dockerRun = new remote.Command("docker-run", {
  connection,
  create: dockerRunCmd,
  triggers: [archive],
}, { dependsOn: [waitForDocker] });

