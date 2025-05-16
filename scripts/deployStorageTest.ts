import { toNano } from '@ton/core';
import { StorageTest } from '../wrappers/StorageTest';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const storageTest = provider.open(
        StorageTest.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('StorageTest')
        )
    );

    await storageTest.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(storageTest.address);

    console.log('ID', await storageTest.getID());
}
