let chai = require("chai")
let chaiAsPromised = require("chai-as-promised")
chai.use(chaiAsPromised)
chai.should()

let Token = artifacts.require("zeppelin-solidity/contracts/token/SimpleToken.sol")
let PensionFundRelease = artifacts.require("./PensionFundRelease.sol")


  contract('PensionFundRelease', (accounts) => {

    const TIME_INCREMENT = 604800
    const FIRST_PAYMENT_PERCENT = 20
    let firstPaymentTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp
    const VALIDATORS = [accounts[0], accounts[1]]
    const WORKER = accounts[2]
    const UNAUTHORIZED = accounts[3]
    const INITIAL_BALANCE = 100
    const PERCENT_DENOMINATOR = 100
    const PAYOUT_PERCENT = 40

    let deployParams = 
    (_firstPaymentTime, _firstPaymentPercent, _token, _payoutPercent) => 
    [
      VALIDATORS,
      WORKER,
      _firstPaymentPercent,
      _firstPaymentTime,
      TIME_INCREMENT,
      _payoutPercent,
      _token
    ]

    let token, fund

    beforeEach( async () => {
      token = await Token.deployed() 
      fund = await PensionFundRelease.new.apply(
        this,
        deployParams(
          firstPaymentTime,
          FIRST_PAYMENT_PERCENT,
          token.address,
          PAYOUT_PERCENT
        )
      )         
    })

    it("#1 should return firstPaymentPercent", async () => {
      let percent = await fund.firstPaymentPercent.call()
      let number = await percent.toNumber()
      number.should.equal(FIRST_PAYMENT_PERCENT)
    })

    it("#2 should return VALIDATORS", async () => {
      let validator = await fund.validators.call(0)
      validator.should.equal(VALIDATORS[0])
    })
    
    it("#3 should allow VALIDATORS to vote", async () => {
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      let index = await fund.voteIndex.call(VALIDATORS[0])
      let vote = await fund.votes.call(index)
      vote[2].should.be.equal("justification")
    })

    it("#4 should not allow non-VALIDATORS to vote", async () => {
      fund.vote(true, "justification", {from: UNAUTHORIZED}).should.be.rejected
    })

    it("#5 should allow release after all VALIDATORS approval", async () => {
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      await fund.vote(true, "justification", {from: VALIDATORS[1]})
      let approval =  await fund.isReleaseApproved.call()
      approval.should.be.equal(true)
    })

    it("#6 should not allow release if not all VALIDATORS approved release", async () => {
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      let vote = await fund.isReleaseApproved.call()
      vote.should.be.equal(false)
    })

    it("#7 should allow burn after all VALIDATORS rejection", async () => {
      await fund.vote(false, "justification", {from: VALIDATORS[0]})
      await fund.vote(false, "justification", {from: VALIDATORS[1]})
      let approval = await fund.isBurnApproved.call()
      approval.should.be.equal(true)
    })

    it("#8 should not allow burn if not all VALIDATORS rejected release", async () => {
      await fund.vote(false, "justification", {from: VALIDATORS[0]})
      let approval = await fund.isBurnApproved.call()
      approval.should.be.equal(false)
    })

    it("#9 should release roots if all conditions met", async () => {
      let workerBalance, balanceNumber
      let balance = INITIAL_BALANCE      
      await token.transfer(fund.address, balance)
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      await fund.vote(true, "justification", {from: VALIDATORS[1]})
      let release = await fund.releaseRoots({from: WORKER})
      release.logs[0].args.amount.toNumber()
      .should.be.equal(balance* FIRST_PAYMENT_PERCENT / PERCENT_DENOMINATOR)
      workerBalance = await token.balanceOf(WORKER)
      workerBalance.toNumber().should.be.equal(balance * FIRST_PAYMENT_PERCENT / PERCENT_DENOMINATOR)
    })

    it("#10 should attempt to release roots before freeze period ends and fail", async () => {
      let balance = INITIAL_BALANCE
      fund = await PensionFundRelease.new.apply(
        this,
        deployParams(
          firstPaymentTime + TIME_INCREMENT,
          FIRST_PAYMENT_PERCENT,
          token.address,
          PAYOUT_PERCENT
        )
      )         
      await token.transfer(fund.address, balance)
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      await fund.vote(true, "justification", {from: VALIDATORS[1]})
      try {
        let release = await fund.releaseRoots({from: WORKER})
      } catch (err) {
        error = err
      } 
      error.should.be.a("Error")
    })

    it("#11 should release all roots over time", async () => {
      let workerBalance, balanceNumber
      let balance = INITIAL_BALANCE
      // Transfer previous balance away
      await token.transfer(UNAUTHORIZED, FIRST_PAYMENT_PERCENT, {from: WORKER})
      await token.transfer(fund.address, balance)
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      await fund.vote(true, "justification", {from: VALIDATORS[1]}) 
      let release = await fund.releaseRoots({from: WORKER})
      while(await fund.balance() > 0){
        web3.currentProvider.send({
          jsonrpc: '2.0',
          method: 'evm_increaseTime',
          params: [TIME_INCREMENT], 
          id: new Date().getTime() 
        })
        release = await fund.releaseRoots({from: WORKER})
        release.logs[0].args.amount.toNumber().should.be.equal(PAYOUT_PERCENT)             
      }
      workerBalance = await token.balanceOf(WORKER)
      workerBalance.toNumber().should.be.equal(INITIAL_BALANCE)   
    })

    it("#12 should release all roots and then release balance of 0", async () => {
      let workerBalance, balanceNumber
      let firstPaymentPercent = PERCENT_DENOMINATOR
      let error;
      let balance = INITIAL_BALANCE 
      fund = await PensionFundRelease.new.apply(
        this,
        deployParams(
          firstPaymentTime,
          firstPaymentPercent,
          token.address,
          PAYOUT_PERCENT
        )
      )     
      // Transfer previous balance away
      await token.transfer(UNAUTHORIZED, INITIAL_BALANCE, {from: WORKER})
      await token.transfer(fund.address, balance)
      await fund.vote(true, "justification", {from: VALIDATORS[0]})
      await fund.vote(true, "justification", {from: VALIDATORS[1]}) 
      let release = await fund.releaseRoots({from: WORKER})
      workerBalance = await token.balanceOf(WORKER)
      workerBalance.toNumber().should.be.equal(INITIAL_BALANCE)
      release = await fund.releaseRoots({from: WORKER})
      release.logs[0].args.amount.toNumber().should.be.equal(0)
    })

});
