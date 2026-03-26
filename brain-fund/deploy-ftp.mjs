import FtpDeploy from "ftp-deploy";

const ftpDeploy = new FtpDeploy();

const config = {
  user: "u637913108.pinkyandthebrain.fun",
  password: "$tsg]o!qiZEQD$P7",
  host: "31.170.161.141",
  port: 21,
  localRoot: "C:/Users/lucid/Desktop/Brain Website Build/out",
  remoteRoot: "/public_html/",
  include: ["*", "**/*", ".*"],
  deleteRemote: true,
  forcePasv: true,
  sftp: false,
};

ftpDeploy.on("uploading", function (data) {
  console.log(`[${data.transferredFileCount}/${data.totalFilesCount}] ${data.filename}`);
});

ftpDeploy.on("upload-error", function (data) {
  console.error("Upload error:", data.err);
});

try {
  const res = await ftpDeploy.deploy(config);
  console.log("Deploy finished. Total files:", res.flat().length);
} catch (err) {
  console.error("Deploy failed:", err);
}
