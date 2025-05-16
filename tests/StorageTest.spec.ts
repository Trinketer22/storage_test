import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, toNano } from '@ton/core';
import { StorageTest } from '../wrappers/StorageTest';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { collectCellStats } from './utils';

describe('StorageTest', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let storageItem: SandboxContract<StorageTest>;

    const maxN = 32;


    beforeAll(async () => {
        code = await compile('StorageTest');


        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');

        storageItem= blockchain.openContract(
            StorageTest.createFromConfig(
                {
                    id: 0,
                    owner: deployer.address
                },
                code
            )
        );
    });


    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and storageTest are ready to use
    });
    it('should init N items', async () => {
        const res = await storageItem.sendInit(deployer.getSender(), { maxN, value: toNano('10') });

        console.log("Init total tx count:", res.transactions.length);

        // Make sure it made full circle
        for(let i = 0; i < maxN; i++) {
            const curItem = blockchain.openContract(
                StorageTest.createFromAddress(
                    await storageItem.getItemAddress(BigInt(i))
                )
            );

            const curIdx = await curItem.getIndex();
            expect(curIdx).toEqual(i);
        }
    });

    it('should clean dictionaries', async () => {
        let statsBefore: bigint[] = Array(maxN);

        for(let i = 0; i < maxN; i++) {
            const curItem = blockchain.openContract(
                StorageTest.createFromAddress(
                    await storageItem.getItemAddress(BigInt(i))
                )
            );

            const itemData = await curItem.getItemData();

            expect(itemData.isCleaned).toBe(false);
            expect(itemData.data).not.toBeUndefined();

            const dataStats = collectCellStats(itemData.data!, []);
            statsBefore[i] = dataStats.cells;
        }

        const res = await storageItem.sendClean(deployer.getSender(), {maxN, value: toNano('10')});

        for(let i = 0; i < maxN; i++) {
            const curItem = blockchain.openContract(
                StorageTest.createFromAddress(
                    await storageItem.getItemAddress(BigInt(i))
                )
            );

            const itemData = await curItem.getItemData();

            expect(itemData.isCleaned).toBe(true);
            expect(itemData.data).not.toBeUndefined();

            const dataStats = collectCellStats(itemData.data!, []);
            expect(statsBefore[i]).toBeGreaterThan(dataStats.cells);

            console.log(`Cells before/after ${i}: ${statsBefore[i]}/${dataStats.cells}`);
        }

        console.log("Clean total tx count:", res.transactions.length);
    });

    it('should destroy all items', async () => {
        let itemAddresses: Address[] = Array(maxN);

        for(let i = 0; i < maxN; i++) {
            const testAddr = await storageItem.getItemAddress(BigInt(i));
            const smc = await blockchain.getContract(testAddr);
            itemAddresses[i] = testAddr;
            expect(smc.accountState?.type == 'active');
        }

        const res = await storageItem.sendDestroy(deployer.getSender(), {maxN, value: toNano('10')});
        console.log("Destory txs count:", res.transactions.length);


        for(let testAddr of itemAddresses) {
            const smc = await blockchain.getContract(testAddr);
            expect(smc.accountState?.type == 'uninit' || smc.accountState?.type == undefined).toBe(true);
        }

    });
});
