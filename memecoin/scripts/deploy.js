const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No PRIVATE_KEY set in .env");

  console.log("Network: ", hre.network.name);
  console.log("Deployer:", deployer.address);

  const token = await hre.ethers.deployContract("Rugbrod");
  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("Rugbrod deployed to:", address);
  console.log(`Explorer: https://sepolia.basescan.org/address/${address}`);
  console.log("\nNext: paste the address into site/index.html (CONTRACT_ADDRESS).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
