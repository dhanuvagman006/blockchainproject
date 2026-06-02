// Hardhat deployment script for ClinicalTrialRegistry
const hre = require("hardhat");

async function main() {
  console.log("Deploying ClinicalTrialRegistry...");
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Factory = await hre.ethers.getContractFactory("ClinicalTrialRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("ClinicalTrialRegistry deployed to:", addr);

  // Register default nodes
  const roles = { PROTOCOL_VALIDATOR: 1, CONSENT_VERIFIER: 2, COMPLIANCE_AUDITOR: 3 };
  const signers = await hre.ethers.getSigners();

  if (signers.length >= 5) {
    await contract.registerNode(signers[1].address, 1, "PharmaCorp-A");
    await contract.registerNode(signers[2].address, 1, "MedResearch-B");
    await contract.registerNode(signers[3].address, 2, "EthicsBoard-C");
    await contract.registerNode(signers[4].address, 3, "RegulatoryFA-E");
    console.log("Default nodes registered.");
  }

  // Save deployment address
  const fs = require("fs");
  fs.writeFileSync("deployment.json", JSON.stringify({ address: addr, deployer: deployer.address }, null, 2));
  console.log("Deployment saved to deployment.json");
}

main().catch((err) => { console.error(err); process.exit(1); });
