const {
  encodeParameters,
  etherUnsigned,
  freezeTime,
  setTime,
  keccak256
} = require('./Utils/Ethereum');

const { expectRevert, time, expectEvent } = require('@openzeppelin/test-helpers');
const { toBN, toWei, fromWei, hexToAscii } = require('web3-utils');


const oneWeekInSeconds = etherUnsigned(7 * 24 * 60 * 60);
const zero = etherUnsigned(0);
const gracePeriod = oneWeekInSeconds.multipliedBy(2);

const TimelockHarness = artifacts.require("TimelockHarness");

contract('TimeLockTest', async (accounts) => {

describe('Timelock', () => {
  let root, notAdmin, newAdmin;
  let blockTimestamp;
  let timelock;
  let delay = oneWeekInSeconds;
  let newDelay = delay.multipliedBy(2);
  let target;
  let value = zero;
  let signature = 'setDelay(uint256)';
  let data = encodeParameters(['uint256'], [newDelay.toFixed()]);
  let revertData = encodeParameters(['uint256'], [etherUnsigned(60 * 60).toFixed()]);
  let eta;
  let revertEta;
  let queuedTxHash;

  before(async () => {
    console.log("before");
    [root, notAdmin, newAdmin] = accounts;
    timelock = await TimelockHarness.new( root, delay);

    blockTimestamp = etherUnsigned(100);
    
    console.log( blockTimestamp.toString() );

    await freezeTime(blockTimestamp.toNumber())
    target = timelock.address;

    blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
    console.log( (await timelock.getBlockTimestamp()).toString() );

    console.log("ETA:");
    eta = delay.plus(blockTimestamp );
    console.log( eta.toString() );

    queuedTxHash = keccak256(
      encodeParameters(
        ['address', 'uint256', 'string', 'bytes', 'uint256'],
        [target, value.toString(), signature, data, eta.toString()]
      )
    );
  });

  describe('constructor', () => {
    it('sets address of admin', async () => {
      let configuredAdmin = await timelock.admin();
      expect(configuredAdmin).equal(root);
    });

    it('sets delay', async () => {
      let configuredDelay = await timelock.delay();
      expect(configuredDelay.toString()).equal(delay.toString());
    });
  });

  describe('setDelay', () => {
    it('requires msg.sender to be Timelock', async () => {
      await expectRevert( timelock.setDelay(delay, { from: root }), 'revert Timelock::setDelay: Call must come from Timelock.');
    });
  });

  describe('setPendingAdmin', () => {
    it('requires msg.sender to be Timelock', async () => {
      await expectRevert(
        timelock.setPendingAdmin(newAdmin, { from: root }), 'revert Timelock::setPendingAdmin: Call must come from Timelock.');
    });
  });

  describe('acceptAdmin', () => {
    afterEach(async () => {
      await timelock.harnessSetAdmin(root, { from: root });
    });

    it('requires msg.sender to be pendingAdmin', async () => {
      await expectRevert(
        timelock.acceptAdmin({ from: notAdmin }),
      'revert Timelock::acceptAdmin: Call must come from pendingAdmin.');
    });

    it('sets pendingAdmin to address 0 and changes admin', async () => {
      await timelock.harnessSetPendingAdmin(newAdmin, { from: root });
      const pendingAdminBefore = await timelock.pendingAdmin();
      expect(pendingAdminBefore).equal(newAdmin);

      const result = await timelock.acceptAdmin({ from: newAdmin });
      const pendingAdminAfter = await timelock.pendingAdmin();
      expect(pendingAdminAfter).equal('0x0000000000000000000000000000000000000000');

      const timelockAdmin = await timelock.admin();
      expect(timelockAdmin).equal(newAdmin);

      expectEvent(result,'NewAdmin', {
        newAdmin
      });

    });
  });

  describe('queueTransaction', () => {
    it('requires admin to be msg.sender', async () => {
      await expectRevert(
        timelock.queueTransaction(target, value, signature, data, eta, { from: notAdmin }),
      'revert Timelock::queueTransaction: Call must come from admin.');
    });

    it('requires eta to exceed delay', async () => {
      const etaLessThanDelay = blockTimestamp.plus(delay).minus(1);

      await expectRevert(
        timelock.queueTransaction(target, value, signature, data, etaLessThanDelay, {
          from: root }),
      'revert Timelock::queueTransaction: Estimated execution block must satisfy delay.');
    });

    it('sets hash as true in queuedTransactions mapping', async () => {

      blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
      eta = delay.plus(blockTimestamp );
  
      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );

      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueBefore).equal(false);


      await timelock.queueTransaction(target, value, signature, data, eta, { from: root });

      const queueTransactionsHashValueAfter = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueAfter).equal(true);
    });

    it('should emit QueueTransaction event', async () => {
      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );

      const result = await timelock.queueTransaction(target, value, signature, data, eta, {
        from: root
      });

      expectEvent(result,'QueueTransaction', {
        data,
        signature,
        target,
        eta: eta.toString(),
        txHash: queuedTxHash,
        value: value.toString()
      });
    });
  });

  describe('cancelTransaction', () => {
    beforeEach(async () => {
      blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
      eta = delay.plus(blockTimestamp ).plus(1);

      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );
  
      await timelock.queueTransaction(target, value, signature, data, eta, { from: root });
    });

    it('requires admin to be msg.sender', async () => {
      await expectRevert(
        timelock.cancelTransaction(target, value, signature, data, eta, { from: notAdmin }),
      'revert Timelock::cancelTransaction: Call must come from admin.');
    });

    it('sets hash from true to false in queuedTransactions mapping', async () => {
      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueBefore).equal(true);

      await timelock.cancelTransaction(target, value, signature, data, eta, { from: root });

      const queueTransactionsHashValueAfter = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueAfter).equal(false);
    });

    it('should emit CancelTransaction event', async () => {
      const result = await timelock.cancelTransaction(target, value, signature, data, eta, {
        from: root
      });

      expectEvent(result,'CancelTransaction', {
        data,
        signature,
        target,
        eta: eta.toString(),
        txHash: queuedTxHash,
        value: value.toString()
      });
    });
  });

  describe('queue and cancel empty', () => {
    it('can queue and cancel an empty signature and data', async () => {
      blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
      eta = delay.plus(blockTimestamp ).plus( 1 );
  
      const txHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), '', '0x', eta.toString()]
        )
      );

      expect(await timelock.queuedTransactions(txHash)).equal( false );

      await timelock.queueTransaction(target, value, '', '0x', eta, { from: root });
      expect(await timelock.queuedTransactions(txHash)).equal( true );

      await timelock.cancelTransaction(target, value, '', '0x', eta, { from: root });
      expect(await timelock.queuedTransactions(txHash)).equal( false );
    });
  });

  describe('executeTransaction (setDelay)', () => {
    beforeEach(async () => {
      blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
      eta = delay.plus(blockTimestamp ).plus(1);

      // Queue transaction that will succeed
      await timelock.queueTransaction(target, value, signature, data, eta, {
        from: root
      });

      blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
      revertEta = delay.plus(blockTimestamp ).plus(1);

      // Queue transaction that will revert when executed
      await timelock.queueTransaction(target, value, signature, revertData, revertEta, {
        from: root
      });
    });

    it('requires admin to be msg.sender', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta, { from: notAdmin })
      ,'revert Timelock::executeTransaction: Call must come from admin.');
    });

    it('requires transaction to be queued', async () => {
      const differentEta = eta.plus(1);
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, differentEta, { from: root })
      ,"revert Timelock::executeTransaction: Transaction hasn't been queued.");
    });

    it('requires timestamp to be greater than or equal to eta', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta, {
          from: root
        }),
        "revert Timelock::executeTransaction: Transaction hasn't surpassed time lock."
      );
    });

    it('requires timestamp to be less than eta plus gracePeriod', async () => {
//      await freezeTime(blockTimestamp.plus(delay).plus(gracePeriod).plus(1).toNumber());
        await setTime(blockTimestamp.plus(delay).plus(gracePeriod).plus(5).toNumber());

      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta, {
          from: root
        }),
      'revert Timelock::executeTransaction: Transaction is stale.');
    });

    it('requires target.call transaction to succeed', async () => {
      //await freezeTime(eta.toNumber());
      await setTime(revertEta.toNumber());

      await expectRevert(
        timelock.executeTransaction(target, value, signature, revertData, revertEta, {
          from: root
        }),
      'revert Timelock::executeTransaction: Transaction execution reverted.');
    });

    it('sets hash from true to false in queuedTransactions mapping, updates delay, and emits ExecuteTransaction event', async () => {
      const configuredDelayBefore = await timelock.delay();
      expect(configuredDelayBefore.toString()).equal(delay.toString());

      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );

      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueBefore).equal(true);

      const newBlockTimestamp = blockTimestamp.plus(delay).plus(1);
      //await freezeTime(newBlockTimestamp.toNumber());
      await setTime(newBlockTimestamp.toNumber());

      const result = await timelock.executeTransaction(target, value, signature, data, eta, {
        from: root
      });

      const queueTransactionsHashValueAfter = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueAfter).equal(false);

      const configuredDelayAfter = await timelock.delay();
      expect(configuredDelayAfter.toString()).equal(newDelay.toString());

      expectEvent(result,'ExecuteTransaction', {
        data,
        signature,
        target,
        eta: eta.toString(),
        txHash: queuedTxHash,
        value: value.toString()
      });

      expectEvent(result,'NewDelay', {
        newDelay: newDelay.toString()
      });
    });
  });

  describe('executeTransaction (setPendingAdmin)', () => {
    beforeEach(async () => {
      const configuredDelay = await timelock.delay();

      delay = etherUnsigned(configuredDelay);
      signature = 'setPendingAdmin(address)';
      data = encodeParameters(['address'], [newAdmin]);

      blockTimestamp = etherUnsigned( await timelock.getBlockTimestamp());
      eta = blockTimestamp.plus(delay).plus(1);

      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );

      await timelock.queueTransaction(target, value, signature, data, eta, {
        from: root
      });
    });

    it('requires admin to be msg.sender', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta, { from: notAdmin }),
      'revert Timelock::executeTransaction: Call must come from admin.');
    });

    it('requires transaction to be queued', async () => {
      const differentEta = eta.plus(1);
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, differentEta, { from: root }),
       "revert Timelock::executeTransaction: Transaction hasn't been queued.");
    });

    it('requires timestamp to be greater than or equal to eta', async () => {
      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta, {
          from: root
        }),
        "revert Timelock::executeTransaction: Transaction hasn't surpassed time lock."
      );
    });

    it('requires timestamp to be less than eta plus gracePeriod', async () => {
      //await freezeTime(blockTimestamp.plus(delay).plus(gracePeriod).plus(1).toNumber());
      await setTime(blockTimestamp.plus(delay).plus(gracePeriod).plus(5).toNumber());

      await expectRevert(
        timelock.executeTransaction(target, value, signature, data, eta, {
          from: root
        }),
      'revert Timelock::executeTransaction: Transaction is stale.');
    });

    it('sets hash from true to false in queuedTransactions mapping, updates admin, and emits ExecuteTransaction event', async () => {
      const configuredPendingAdminBefore = await timelock.pendingAdmin();
      expect(configuredPendingAdminBefore).equal('0x0000000000000000000000000000000000000000');

      const queueTransactionsHashValueBefore = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueBefore).equal(true);

      const newBlockTimestamp = blockTimestamp.plus(delay).plus(1);
      //await freezeTime(newBlockTimestamp.toNumber())
      await setTime(newBlockTimestamp.toNumber());

      const result = await timelock.executeTransaction(target, value, signature, data, eta, {
        from: root
      });

      const queueTransactionsHashValueAfter = await timelock.queuedTransactions(queuedTxHash);
      expect(queueTransactionsHashValueAfter).equal(false);

      const configuredPendingAdminAfter = await timelock.pendingAdmin();
      expect(configuredPendingAdminAfter).equal(newAdmin);

      expectEvent(result,'ExecuteTransaction', {
        data,
        signature,
        target,
        eta: eta.toString(),
        txHash: queuedTxHash,
        value: value.toString()
      });

      expectEvent(result,'NewPendingAdmin', {
        newPendingAdmin: newAdmin
      });
    });
  });
});
});