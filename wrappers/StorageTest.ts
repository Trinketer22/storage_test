import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type StorageTestConfig = {
    id: number;
    owner: Address,
};

export function storageTestConfigToCell(config: StorageTestConfig): Cell {
    return beginCell().storeBit(false).storeUint(config.id, 32).storeAddress(config.owner).storeDict(null).endCell();
}

export const Opcodes = {
    OP_INIT    : 42,
    OP_CLEAN   : 24,
    OP_DESTROY : 3210,
};

export class StorageTest implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new StorageTest(address);
    }

    static createFromConfig(config: StorageTestConfig, code: Cell, workchain = 0) {
        const data = storageTestConfigToCell(config);
        const init = { code, data };
        return new StorageTest(contractAddress(workchain, init), init);
    }

    async sendInit(
        provider: ContractProvider,
        via: Sender,
        opts: {
            maxN: number,
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.OP_INIT, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.maxN, 32)
                .endCell(),
        });
    }

    async sendClean(
        provider: ContractProvider,
        via: Sender,
        opts: {
            maxN: number,
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.OP_CLEAN, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.maxN, 32)
                .endCell(),
        });
    }

    async sendDestroy(
        provider: ContractProvider,
        via: Sender,
        opts: {
            maxN: number,
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.OP_DESTROY, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.maxN, 32)
                .endCell(),
        });
    }


    async getIndex(provider: ContractProvider) {
        const result = await this.getItemData(provider);
        return result.index;
    }

    async getItemAddress(provider: ContractProvider, index: bigint) {
        const result = await provider.get('addressByIndex', [{type: 'int', value: index}]);
        return result.stack.readAddress();
    }

    async getItemData(provider: ContractProvider) {
        const { stack } = await provider.get('getItemData', []);
        return {
            isCleaned: stack.readBoolean(),
            index: stack.readNumber(),
            owner: stack.readAddress(),
            data: stack.readCellOpt(),
        }
    }
}
