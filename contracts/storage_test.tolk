
import "@stdlib/tvm-dicts";

const TRUNCATE_DEPTH = 3;

const OP_INIT    = 42;
const OP_CLEAN   = 24;
const OP_DESTROY = 3210;


const ERROR_ALREADY_CLEANED = 503;
const ERROR_INVALID_SENDER = 403;

global initialBody: slice;
global firstBranch: bool;

// loadData populates storage variables from persistent storage
struct State {
    cleaned: bool;
    index: int;
    owner: slice;
    data: dict
}

@inline
fun loadData() {
    var ds = contract.getData().beginParse();

    var state: State = {
        cleaned: ds.loadBool(),
        index: ds.loadUint(32),
        owner: ds.loadAddress(),
        data:  ds.loadDict()
    };
    ds.assertEnd();

    return state;
}

// saveData stores storage variables as a cell into persistent storage
@inline
fun saveData(state: State) {
    contract.setData(
        beginCell()
        .storeBool(state.cleaned)
        .storeUint(state.index, 32)
        .storeSlice(state.owner)
        .storeDict(state.data)
        .endCell()
    );
}

@inline_ref
fun itemStateInit(index: int, owner: slice) {
    var data = beginCell()
                .storeBool(false)
                .storeUint(index, 32)
                .storeSlice(owner)
                .storeDict(null)
              .endCell();
    return beginCell()
            .storeUint(0, 2)
            .storeMaybeRef(contract.getCode())
            .storeMaybeRef(data)
            .storeUint(0, 1)
           .endCell();
}

@inline_ref
fun itemAddress(stateInit: cell) {
    return beginCell()
    .storeUint(4, 3) // 0b100 = addr_std$10 tag; No anycast
    .storeInt(0, 8) // basechain
    .storeUint(cell.hash(stateInit), 256)
    .endCell()
    .beginParse();

}

const MSG_INFO_REST_BITS = 1 + 4 + 4 + 64 + 32;

const MSG_WITH_STATE_INIT_AND_BODY_SIZE = MSG_INFO_REST_BITS + 1 + 1 + 1;
const MSG_HAVE_STATE_INIT = 4;
const MSG_STATE_INIT_IN_REF = 2;
const MSG_BODY_IN_REF = 1;
const MSG_ONLY_BODY_SIZE = MSG_INFO_REST_BITS + 1 + 1;

@inline
fun builder.storeOnlyBodyRef(mutate self, body: cell) {
    return self
    .storeUint(MSG_BODY_IN_REF, MSG_ONLY_BODY_SIZE)
    .storeRef(body);
}

@inline
fun builder.storeStateinitRefAndBodyRef(mutate self, stateInit: cell, body: cell) {
    return self.storeUint(MSG_HAVE_STATE_INIT + MSG_STATE_INIT_IN_REF + MSG_BODY_IN_REF, MSG_WITH_STATE_INIT_AND_BODY_SIZE)
            .storeRef(stateInit)
            .storeRef(body);
}

@inline
fun sendNextItemMessage(to: slice, amount: int, mode: int) {
    var msg = beginCell()
        .storeUint(NON_BOUNCEABLE, 6)
        .storeSlice(to)
        .storeCoins(amount)
        .storeUint(0, MSG_ONLY_BODY_SIZE)
        .storeSlice(initialBody);

    sendRawMessage(msg.endCell(), mode);
}

@inline
fun initItem(index: int, owner: slice) {
    var stateInit = itemStateInit(index, owner);
    var toItem    = itemAddress(stateInit);

    var msgBody: cell = beginCell().storeSlice(initialBody).endCell();

    var msg: cell = beginCell()
        .storeUint(NON_BOUNCEABLE, 6)
        .storeSlice(toItem)
        .storeCoins(0)
        .storeStateinitRefAndBodyRef(stateInit, msgBody)
    .endCell();

    sendRawMessage(msg, SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun cell.truncateAtDepth(self, depth: int): cell {
    var cs = self.beginParse();
    var l: cell? = null;
    var r: cell? = null;

    var refCount = cs.remainingRefsCount();

    if(refCount > 0) {
        l = cs.loadRef();
        if(refCount == 2) {
            r = cs.loadRef();
        }
    } else {
        // Empty branch -> nothing we can do
        return self;
    }

    var res = beginCell().storeSlice(cs);

    if(depth > 0) {
        res.storeRef(l.truncateAtDepth(depth - 1));

        if(r != null) {
            res.storeRef(r.truncateAtDepth(depth - 1));
        }
    } else {
        if(refCount == 2) {
            if(random.range(2) & 1) {
                res.storeRef(r!);
                // If first branch - store both
                if(firstBranch) {
                    res.storeRef(l!);
                }
            } else {
                // If first branch - remove both
                if(!firstBranch) {
                    res.storeRef(l!);
                }
            }
            // But only once per run
            firstBranch = false;
        }
        // If only one left don't store anything
    }

    return res.endCell();
}

// onInternalMessage is the main entrypoint; it's called when a contract receives an internal message from other contracts
fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs: slice = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    var senderAddress: slice = cs.loadAddress();

    var state = loadData();

    initialBody = msgBody;

    val op = msgBody.loadMessageOp(); // by convention, the first 32 bits of incoming message is the op
    val queryID = msgBody.loadMessageQueryId(); // also by convention, the next 64 bits contain the "query id", although this is not always the case

    // Max idx is N
    var N = msgBody.loadUint(32);

    // Accept init only from owner or lower neighbour;
    if(!senderAddress.bitsEqual(state.owner)) {
        // Modular - 1
        var prevIdx = (N + (state.index  - 1)) % N;
        assert(senderAddress.bitsEqual(itemAddress(itemStateInit(prevIdx, state.owner))), ERROR_INVALID_SENDER);
    }

    var nextIdx  = (state.index + 1) % N;

    random.initialize();

    try {
        if (op == OP_INIT) {
            reserveToncoinsOnBalance(ton("0.01"), RESERVE_MODE_EXACT_AMOUNT);
            initItem(nextIdx, state.owner);

            repeat(10) {
                var seed = random.uint256();
                var key  = seed;

                // 50/50 prob
                if(seed & 1) {
                    key = seed >> 251; // Top 5 bits could take from 1 to 16
                }

                state.data.uDictSetRef(256, key, beginCell().storeUint(seed, 256).endCell());
            }

            saveData(state);
            return;
        }

        if (op == OP_CLEAN) {
            assert(!state.cleaned, ERROR_ALREADY_CLEANED);

            reserveToncoinsOnBalance(ton("0.01"), RESERVE_MODE_EXACT_AMOUNT);
            var nextAddr = itemAddress(itemStateInit(nextIdx, state.owner));

            sendNextItemMessage(nextAddr, 0, SEND_MODE_CARRY_ALL_BALANCE);

            assert(state.data != null, 123);
            var seed = random.uint256();

            firstBranch = true;

            var newData = state.data.truncateAtDepth(TRUNCATE_DEPTH);
            saveData({cleaned: true, owner: state.owner, index: state.index, data: newData });

            return;
        }
        if (op == OP_DESTROY) {
            var nextAddr = itemAddress(itemStateInit(nextIdx, state.owner));
            // Should be enough for cleanup
            sendNextItemMessage(nextAddr, ton("0.01") * N, SEND_MODE_REGULAR);
            // Rest to the owner and destroy
            sendNextItemMessage(state.owner, 0, SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_DESTROY);
            return;
        }
    } catch(e) {
        sendNextItemMessage(state.owner, 0, SEND_MODE_CARRY_ALL_BALANCE);
        return;
    }

    throw 0xffff; // if the message contains an op that is not known to this contract, we throw
}

// get methods are a means to conveniently read contract data using, for example, HTTP APIs
// note that unlike in many other smart contract VMs, get methods cannot be called by other contracts

get getItemData() {
    var state = loadData();
    return state;
}

get addressByIndex(index: int): slice {
    var state = loadData();
    return itemAddress(itemStateInit(index, state.owner));
}
