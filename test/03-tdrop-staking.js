const { constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { BigNumber } = require("@ethersproject/bignumber");
const { expect } = require('chai');
const { ZERO_ADDRESS } = constants;

describe("TDrop Staking", function () {

    let TDropToken;
    let tdropToken;

    let TDropParams;
    let tdropParams;

    let TDropStaking;
    let tdropStaking;

    let deployer;
    let admin;
    let airdropper;
    let addrs;

    beforeEach(async function () {
        TDropToken = await ethers.getContractFactory("TDropToken");
        TDropParams = await ethers.getContractFactory("TDropParams");
        TDropStaking = await ethers.getContractFactory("TDropStaking");

        [deployer, superAdmin, admin, airdropper, ...addrs] = await ethers.getSigners();

        tdropToken = await TDropToken.deploy(superAdmin.address, admin.address);
        await tdropToken.deployed();

        tdropParams = await TDropParams.deploy(superAdmin.address, admin.address);
        await tdropParams.deployed();

        tdropStaking = await TDropStaking.deploy(superAdmin.address, admin.address, tdropToken.address, tdropParams.address);
        await tdropStaking.deployed();

        await tdropToken.connect(admin).setAirdropper(airdropper.address);
        await tdropToken.connect(admin).setStakingPool(tdropStaking.address);
        await tdropToken.connect(admin).unpause();
    });

    describe("Contract Initialization", function () {
        this.timeout(50000);

        it("Should correctly initialize the Contract", async function () {
            expect(await tdropStaking.superAdmin()).to.equal(superAdmin.address);
            expect(await tdropStaking.admin()).to.equal(admin.address);
            expect(await tdropStaking.tdrop()).to.equal(tdropToken.address);
            expect(await tdropStaking.tdropParams()).to.equal(tdropParams.address);
            expect(await tdropStaking.totalShares()).to.equal(0);
            expect(await tdropStaking.paused()).to.equal(true);
        });

        it("Should correctly set super admin", async function () {
            let superAdmin2 = addrs[0];

            // only super admin can set super admin
            await expect(tdropStaking.connect(admin).setSuperAdmin(superAdmin2)).to.be.reverted;
            await tdropStaking.connect(superAdmin).setSuperAdmin(superAdmin2.address);
            expect(await tdropStaking.superAdmin()).to.equal(superAdmin2.address);
        });

        it("Should correctly set admin", async function () {
            let admin2 = addrs[1];
            let airdropper2 = addrs[2];

            // only the super admin can set admin
            await expect(tdropStaking.connect(admin).setAdmin(admin2.address)).to.be.reverted;
            await expect(tdropStaking.connect(admin2).setAdmin(airdropper2.address)).to.be.reverted;
            expect(await tdropStaking.admin()).to.equal(admin.address);

            // the super admin can successfully change the admin
            await tdropStaking.connect(superAdmin).setAdmin(admin2.address);
            expect(await tdropStaking.admin()).to.equal(admin2.address);
        });

        it("Only the admin can pause/unpause the token", async function () {
            let admin2 = addrs[0];

            await expect(tdropStaking.connect(admin2).unpause()).to.be.reverted;
            expect(await tdropStaking.paused()).to.equal(true);
            await expect(tdropStaking.connect(admin2).pause()).to.be.reverted;

            await tdropStaking.connect(admin).unpause();
            expect(await tdropStaking.paused()).to.equal(false);
            await tdropStaking.connect(admin).pause();
            expect(await tdropStaking.paused()).to.equal(true);
        });

    });

    describe("Stake/Unstake", function () {
        this.timeout(50000);

        beforeEach(async () => {
            await tdropStaking.connect(admin).unpause();
        });

        it("mint shares 1:1 when balance is zero", async function () {
            let recipient1 = addrs[2];
            let recipient2 = addrs[3];
            let amount1 = 998;
            let amount2 = 72327847929;

            await expect(tdropToken.connect(airdropper).airdrop([recipient1.address, recipient2.address], [amount1, amount2]));

            // initially the recipient should have no shares
            expect(await tdropStaking.balanceOf(recipient1.address)).to.be.equal(0);

            await tdropToken.connect(recipient1).approve(tdropStaking.address, 100);
            await tdropStaking.connect(recipient1).stake(100);
            expect(await tdropToken.balanceOf(recipient1.address)).to.be.equal(amount1 - 100);
            expect(await tdropStaking.balanceOf(recipient1.address)).to.be.equal(100);
        });

        it("mint shares pro rata when balance is non-zero", async function () {
            let alice = addrs[2];
            let bob = addrs[3];
            let amount1 = 10000;
            let amount2 = 10000;

            await expect(tdropToken.connect(airdropper).airdrop([alice.address, bob.address], [amount1, amount2]));

            // initially the recipient should have no shares
            expect(await tdropStaking.balanceOf(alice.address)).to.be.equal(0);

            // alice stake 100 
            await tdropToken.connect(alice).approve(tdropStaking.address, 100);
            await tdropStaking.connect(alice).stake(100);
            expect(await tdropToken.balanceOf(alice.address)).to.be.equal(amount1 - 100);
            expect(await tdropStaking.balanceOf(alice.address)).to.be.equal(100);

            // bob stake 100 
            await tdropToken.connect(bob).approve(tdropStaking.address, 100);
            await tdropStaking.connect(bob).stake(100);
            // Make sure staking pool balance is 200(minting is not enabled) so the calculation matches
            expect(await tdropToken.balanceOf(tdropStaking.address)).to.equal(200);
            expect(await tdropToken.balanceOf(bob.address)).to.be.equal(amount2 - 100);
            expect(await tdropStaking.balanceOf(bob.address)).to.be.equal(100);

            // Add balance to staking pool without staking
            await expect(tdropToken.connect(airdropper).airdrop([tdropStaking.address], [200]));

            // bob stakes another 100 and gets 50 shares
            await tdropToken.connect(bob).approve(tdropStaking.address, 100);
            await tdropStaking.connect(bob).stake(100);
            expect(await tdropStaking.balanceOf(bob.address)).to.be.equal(100 + 50);
        });

        it("burn shares and return tdrop", async function () {
            let alice = addrs[2];
            let bob = addrs[3];
            let amount1 = 10000;
            let amount2 = 10000;

            await expect(tdropToken.connect(airdropper).airdrop([alice.address, bob.address], [amount1, amount2]));

            // initially the recipient should have no shares
            expect(await tdropStaking.balanceOf(alice.address)).to.be.equal(0);

            // alice stake 100 
            await tdropToken.connect(alice).approve(tdropStaking.address, 100);
            await tdropStaking.connect(alice).stake(100);
            expect(await tdropToken.balanceOf(alice.address)).to.be.equal(amount1 - 100);
            expect(await tdropStaking.balanceOf(alice.address)).to.be.equal(100);

            // bob stake 100 
            await tdropToken.connect(bob).approve(tdropStaking.address, 100);
            await tdropStaking.connect(bob).stake(100);
            // Make sure staking pool balance is 200(minting is not enabled) so the calculation matches
            expect(await tdropToken.balanceOf(tdropStaking.address)).to.equal(200);
            expect(await tdropToken.balanceOf(bob.address)).to.be.equal(amount2 - 100);
            expect(await tdropStaking.balanceOf(bob.address)).to.be.equal(100);

            // Add balance to staking pool without staking. share price = $2
            await expect(tdropToken.connect(airdropper).airdrop([tdropStaking.address], [200]));

            // bob stakes another 100 and gets 50 shares
            await tdropToken.connect(bob).approve(tdropStaking.address, 100);
            await tdropStaking.connect(bob).stake(100);
            expect(await tdropToken.balanceOf(bob.address)).to.be.equal(amount2 - 100 - 100);
            expect(await tdropStaking.balanceOf(bob.address)).to.be.equal(100 + 50);
            expect(await tdropStaking.totalShares()).to.equal(100 + 100 + 50);

            // bob unstake 50 shares
            await tdropStaking.connect(bob).unstake(50);
            expect(await tdropToken.balanceOf(bob.address)).to.be.equal(amount2 - 100);
            expect(await tdropStaking.balanceOf(bob.address)).to.be.equal(100);
            expect(await tdropStaking.totalShares()).to.equal(100 + 100);

            // alice unstake 100 shares
            await tdropStaking.connect(alice).unstake(100);
            expect(await tdropToken.balanceOf(alice.address)).to.be.equal(amount1 - 100 + 200);
            expect(await tdropStaking.balanceOf(alice.address)).to.equal(0);
            expect(await tdropStaking.totalShares()).to.equal(100);

            // bob unstake remaining 100 shares
            await tdropStaking.connect(bob).unstake(100);
            expect(await tdropToken.balanceOf(bob.address)).to.be.equal(amount2 - 100 + 200);
            expect(await tdropStaking.balanceOf(bob.address)).to.equal(0);
            expect(await tdropStaking.totalShares()).to.equal(0);
        });
    });

    describe("Pause Token", function () {
        this.timeout(50000);

        it("Cannot stake when paused", async function () {
            let recipient1 = addrs[2];
            let amount1 = 998;

            await expect(tdropToken.connect(airdropper).airdrop([recipient1.address], [amount1]));

            expect(await tdropStaking.balanceOf(recipient1.address)).to.be.equal(0);

            // stake
            await tdropToken.connect(recipient1).approve(tdropStaking.address, 100);
            await expect(tdropStaking.connect(recipient1).stake(100)).to.be.revertedWith('TDropStaking::onlyWhenUnpaused: token is paused');

            await tdropStaking.connect(admin).unpause();
            
            await tdropStaking.connect(recipient1).stake(100);
            
            expect(await tdropToken.balanceOf(recipient1.address)).to.be.equal(amount1 - 100);
            expect(await tdropStaking.balanceOf(recipient1.address)).to.be.equal(100);

            // unstake
            await tdropStaking.connect(admin).pause();

            await expect(tdropStaking.connect(recipient1).unstake(100)).to.be.revertedWith('TDropStaking::onlyWhenUnpaused: token is paused');

            await tdropStaking.connect(admin).unpause();

            await tdropStaking.connect(recipient1).unstake(100);

            expect(await tdropToken.balanceOf(recipient1.address)).to.be.equal(amount1);
            expect(await tdropStaking.balanceOf(recipient1.address)).to.be.equal(0);

        });
    });

});