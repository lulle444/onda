const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Rugbrod", () => {
  it("mints the full fixed supply to the deployer", async () => {
    const [deployer] = await ethers.getSigners();
    const token = await ethers.deployContract("Rugbrod");
    const supply = ethers.parseUnits("1000000000", 18);

    expect(await token.name()).to.equal("Rugbrød");
    expect(await token.symbol()).to.equal("RUGBROD");
    expect(await token.totalSupply()).to.equal(supply);
    expect(await token.balanceOf(deployer.address)).to.equal(supply);
  });

  it("transfers without any tax", async () => {
    const [deployer, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("Rugbrod");
    const amount = ethers.parseUnits("1000", 18);

    await token.transfer(alice.address, amount);
    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("has no owner or mint function", async () => {
    const token = await ethers.deployContract("Rugbrod");
    expect(token.owner).to.equal(undefined);
    expect(token.mint).to.equal(undefined);
  });
});
