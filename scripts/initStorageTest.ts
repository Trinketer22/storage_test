import { Address, fromNano } from '@ton/core';
import { StorageTest } from '../wrappers/StorageTest';
import { compile, NetworkProvider } from '@ton/blueprint';
import { promptAddress, promptAmount, promptBool, promptToncoin } from '../wrappers/ui-uitls';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    let isOk = false;
    let owner: Address;
    let maxN: bigint;
    let attachValue: bigint;

    do {
        owner = await promptAddress("Please specify owner address:", ui, provider.sender().address);
        maxN  = await promptAmount("Please specify ring N:", 0, ui);
        attachValue = await promptToncoin("Please specify toncoin amount to attach:", ui);

        ui.write(JSON.stringify({
            owner,
            maxN,
            attachValue: fromNano(attachValue)
        }, null, 2));

        isOk = await promptBool("Is it ok?", ["y", "n"], ui, false);
    } while(!isOk);

    const storageTest = provider.open(
        StorageTest.createFromConfig(
            {
                id: 0,
                owner 
            },
            await compile('StorageTest')
        )
    );

    await storageTest.sendInit(provider.sender(), {
        maxN: Number(maxN),
        value: attachValue,
    });

    await provider.waitForDeploy(storageTest.address);
}
