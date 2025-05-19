import { NetworkProvider, UIProvider } from '@ton/blueprint';
import { StorageTest } from '../wrappers/StorageTest';
import { OpenedContract, Sender, fromNano } from '@ton/core';
import { promptAddress, promptAmount, promptBool, promptToncoin } from '../wrappers/ui-uitls';

let itemContract: OpenedContract<StorageTest>;
let maxN: number;

async function cleanItem(sender: Sender, ui: UIProvider) {
    const itemData = await itemContract.getItemData();

    let done = false;
    if(itemData.isCleaned) {
        ui.write("Item is already cleaned!");
        return;
    }


    const attachAmount = await promptToncoin("Plase specify TON ammount to attach:", ui);
    ui.write(`Attaching ${fromNano(attachAmount)} ton to destroy message`)

    do {
        ui.write(`Attaching ${fromNano(attachAmount)} ton to clean message`)
        done = await promptBool("Is it ok?", ["y", "n"], ui, false);
    } while(!done);

    await itemContract.sendClean(sender, {maxN, value: attachAmount});
}

async function destroyRing(sender: Sender, ui: UIProvider) {
    const attachAmount = await promptToncoin("Plase specify TON ammount to attach:", ui);
    let done = false;
    do {
        ui.write(`Attaching ${fromNano(attachAmount)} ton to destroy message`)

        done = await promptBool("Is it ok?", ["y", "n"], ui, false);
    } while(!done);
    await itemContract.sendDestroy(sender, {maxN, value: attachAmount});
}

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    itemContract = provider.open(
        StorageTest.createFromAddress(
            await promptAddress("Please specify item address:", ui)
        )
    );

    maxN = Number(await promptAmount("Plase specify ring max N:", 0, ui));

    let itemData = await itemContract.getItemData();
    const senderAddress = provider.sender().address;

    if(senderAddress && !senderAddress.equals(itemData.owner)) {
        throw new Error(`Item is owned by a different address: ${itemData.owner.toString()}`);
    }

    while(true) {
        const action = await ui.choose("Please choose action", ["Clean items", "Destroy ring", "Quit"],(v) => v);
        switch(action) {
            case "Clean items":
                await cleanItem(provider.sender(), ui);
                break;
            case "Destroy ring":
                await destroyRing(provider.sender(), ui);
                break;
            case "Quit":
                return;
        }
    }
}

