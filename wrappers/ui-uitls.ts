import { UIProvider } from '@ton/blueprint';
import { Address } from '@ton/core';

function getMultiplier(decimals: number): bigint {
    let x = 1n;
    for (let i = 0; i < decimals; i++) {
        x *= 10n;
    }
    return x;
}

export function toUnits(src: string | bigint, decimals: number): bigint {
    const MULTIPLIER = getMultiplier(decimals);

    if (typeof src === 'bigint') {
        return src * MULTIPLIER;
    } else {

        // Check sign
        let neg = false;
        while (src.startsWith('-')) {
            neg = !neg;
            src = src.slice(1);
        }

        // Split string
        if (src === '.') {
            throw Error('Invalid number');
        }
        let parts = src.split('.');
        if (parts.length > 2) {
            throw Error('Invalid number');
        }

        // Prepare parts
        let whole = parts[0];
        let frac = parts[1];
        if (!whole) {
            whole = '0';
        }
        if (!frac) {
            frac = '0';
        }
        if (frac.length > decimals && decimals != 0) {
            throw Error('Invalid number');
        }
        while (frac.length < decimals) {
            frac += '0';
        }

        // Convert
        let r = BigInt(whole) * MULTIPLIER + BigInt(frac);
        if (neg) {
            r = -r;
        }
        return r;
    }
}
export const promptToncoin = async (prompt: string, provider: UIProvider) => {
    return promptAmount(prompt, 9, provider);
}

export const promptAmount = async (prompt: string, decimals: number, provider: UIProvider) => {
    let resAmount: bigint;
    do {
        const inputAmount = await provider.input(prompt);
        try {
            resAmount = toUnits(inputAmount, decimals);

            if (resAmount <= 0) {
                throw new Error("Please enter positive number");
            }

            return resAmount;
        } catch (e: any) {
            provider.write(e.message);
        }
    } while (true);
}

export const promptAddress = async (prompt: string, provider: UIProvider, fallback?: Address) => {
    let promptFinal = fallback ? prompt.replace(/:$/, '') + `(default:${fallback}):` : prompt;
    do {
        let testAddr = (await provider.input(promptFinal)).replace(/^\s+|\s+$/g, '');
        try {
            return testAddr == "" && fallback ? fallback : Address.parse(testAddr);
        } catch (e) {
            provider.write(testAddr + " is not valid!\n");
            prompt = "Please try again:";
        }
    } while (true);

}

export const promptBool = async (prompt: string, options: [string, string], ui: UIProvider, choice: boolean = false) => {
    let yes = false;
    let no = false;
    let opts = options.map(o => o.toLowerCase());

    do {
        let res = (choice ? await ui.choose(prompt, options, (c: string) => c) : await ui.input(`${prompt}(${options[0]}/${options[1]})`)).toLowerCase();
        yes = res == opts[0]
        if (!yes)
            no = res == opts[1];
    } while (!(yes || no));

    return yes;
}
