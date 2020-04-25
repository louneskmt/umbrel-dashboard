import API from "@/helpers/api";
import { toPrecision } from "@/helpers/units";

// Initial state
const state = () => ({
  operational: false,
  calibrating: false,
  version: "",
  ipAddress: "",
  onionAddress: "",
  currentBlock: 0,
  blockHeight: 0,
  blocks: [],
  percent: -1, //for loading state
  depositAddress: "",
  stats: {
    peers: 0,
    mempool: 0,
    hashrate: 0,
    blockchainSize: 0
  },
  peers: {
    total: 0,
    inbound: 0,
    outbound: 0
  },
  balance: {
    total: -1, //loading
    confirmed: -1,
    pending: -1,
    pendingIn: -1,
    pendingOut: -1
  },
  transactions: [{ type: 'loading' }, { type: 'loading' }, { type: 'loading' }, { type: 'loading' }],
  pending: [],
  price: 0,
  fees: {
    fast: {
      total: "--",
      perByte: "--",
      error: {
        code: "",
        text: ""
      }
    },
    normal: {
      total: "--",
      perByte: "--",
      error: {
        code: "",
        text: ""
      }
    },
    slow: {
      total: "--",
      perByte: "--",
      error: {
        code: "",
        text: ""
      }
    },
    cheapest: {
      total: "--",
      perByte: "--",
      error: {
        code: "",
        text: ""
      }
    }
  }
});

// Functions to update the state directly
const mutations = {
  isOperational(state, operational) {
    state.operational = operational;
  },

  ipAddress(state, address) {
    state.ipAddress = address;
  },

  onionAddress(state, address) {
    state.onionAddress = address;
  },

  syncStatus(state, sync) {
    state.percent = toPrecision(parseFloat(sync.percent) * 100, 2);
    state.currentBlock = sync.currentBlock;
    state.blockHeight = sync.headerCount;

    if (sync.status === "calibrating") {
      state.calibrating = true;
    } else {
      state.calibrating = false;
    }
  },

  setBlocks(state, blocks) {
    state.blocks = blocks;
  },

  setVersion(state, version) {
    state.version = version.version;
  },

  setStats(state, stats) {
    setTimeout(() => state.stats = stats, 1000);
  },

  peers(state, peers) {
    state.peers.total = peers.total || 0;
    state.peers.inbound = peers.inbound || 0;
    state.peers.outbound = peers.outbound || 0;
  },

  balance(state, balance) {
    state.balance.total = parseInt(balance.totalBalance);
    state.balance.confirmed = parseInt(balance.confirmedBalance);
    state.balance.pending = parseInt(balance.unconfirmedBalance);
  },

  transactions(state, transactions) {
    // Clear previously loaded data
    // state.transactions = [];
    // state.pending = [];

    // Loop through transactions and sort them by type
    // transactions.forEach((transaction) => {
    //     // Only display Bitcoin transactions
    //     if (transaction.type === 'ON_CHAIN_TRANSACTION_SENT' || transaction.type === 'ON_CHAIN_TRANSACTION_RECEIVED') {
    //         if (transaction.numConfirmations > 0) {
    //             state.transactions.push(transaction);
    //         } else {
    //             state.pending.push(transaction);
    //         }
    //     }
    // });
    // console.log(transactions);

    state.transactions = transactions;
  },

  depositAddress(state, address) {
    state.depositAddress = address;
  },

  fees(state, fees) {
    for (const [speed, estimate] of Object.entries(fees)) {
      // If the API returned an error message
      if (estimate.code) {
        state.fees[speed].total = "N/A";
        state.fees[speed].perByte = "N/A";
        state.fees[speed].error = {
          code: estimate.code,
          text: estimate.text
        };
      } else {
        state.fees[speed].total = estimate.feeSat;
        state.fees[speed].perByte = estimate.feerateSatPerByte;
        state.fees[speed].sweepAmount = estimate.sweepAmount;
        state.fees[speed].error = false;
      }
    }
  },

  price(state, usd) {
    state.price = usd;
  }
};

// Functions to get data from the API
const actions = {
  async getStatus({ commit, dispatch }) {
    const status = await API.get(
      `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/status`
    );

    if (status) {
      commit("isOperational", status.operational);

      if (status.operational) {
        dispatch("getSync");
      }
    }
  },

  async getAddresses({ commit, state }) {
    // We can only make this request when bitcoind is operational
    if (state.operational) {
      const addresses = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/addresses`
      );

      // Default onion address to not found.
      commit("onionAddress", "Could not determine bitcoin onion address");

      if (addresses) {
        addresses.forEach(address => {
          if (address.includes(".onion")) {
            commit("onionAddress", address);
          } else {
            commit("ipAddress", address);
          }
        });
      }
    }
  },

  async getSync({ commit, state }) {
    if (state.operational) {
      const sync = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/sync`
      );

      if (sync) {
        commit("syncStatus", sync);
      }
    }
  },

  async getBlocks({ commit, state, dispatch }) {
    if (state.operational) {
      await dispatch("getSync");

      //cache block height array of latest 3 blocks for loading view
      const currentBlock = state.currentBlock;

      //dont fetch blocks if no new block
      if (state.blocks.length && currentBlock === state.blocks[0]['height']) {
        return;
      }

      if (currentBlock < 4) {
        return;
      }

      const blocks = [
        {
          height: currentBlock, //block height
          txs: null,
          timestamp: null,
          size: null
        },
        {
          height: currentBlock - 1, //block height
          txs: null,
          timestamp: null,
          size: null
        },
        {
          height: currentBlock - 2, //block number
          txs: null,
          timestamp: null,
          size: null
        }
      ];
      // commit("setBlocks", blocks);


      //fetch info per block;

      const blocksWithInfo = [];

      for (let block of blocks) {
        //get hash
        const blockHash = await API.get(
          `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/block?height=${block.height}`
        );

        if (!blockHash || !blockHash.hash) {
          return;
        }

        //gete block info
        const blockInfo = await API.get(
          `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/block?hash=${blockHash.hash}`
        );

        if (!blockInfo || !blockInfo.block) {
          return;
        }

        blocksWithInfo.push({
          height: blockInfo.height,
          txs: blockInfo.transactions.length,
          timestamp: blockInfo.blocktime,
          size: blockInfo.size
        })
      }

      // update blocks
      commit("setBlocks", blocksWithInfo);

    }
  },

  async getVersion({ commit, state }) {
    if (state.operational) {
      const version = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/version`
      );

      if (version) {
        commit("setVersion", version);
      }
    }
  },

  async getPeers({ commit, state }) {
    if (state.operational) {
      const peers = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/connections`
      );

      if (peers) {
        commit("peers", peers);
      }
    }
  },

  async getStats({ commit, state }) {
    if (state.operational) {
      // const stats = await API.get(
      //   `${process.env.VUE_APP_API_URL}api/v1/bitcoind/info/stats`
      // );
      const stats = {
        peers: 8,
        mempool: 2,
        hashrate: 102,
        blockchainSize: 304
      };
      if (stats) {
        commit("setStats", stats);
      }
    }
  },

  async getBalance({ commit, state }) {
    if (state.operational) {
      const balance = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/lnd/wallet/btc`
      );

      if (balance) {
        commit("balance", balance);
      }
    }
  },

  async getTransactions({ commit, state }) {
    if (state.operational) {
      const transactions = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/lnd/transaction`
      );
      commit("transactions", transactions);
    }
  },

  async getPrice({ commit }) {
    // Todo: Cache this value on the node instead of making a 3rd party request
    const price = await API.get(
      "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD"
    );

    if (price) {
      commit("price", price.USD);
    }
  },

  async getDepositAddress({ commit, state }) {
    if (state.operational) {
      const { address } = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/lnd/address`
      );

      if (address) {
        commit("depositAddress", address);
      }
    }
  },

  async getFees({ commit, state }, { address, confTarget, amt, sweep }) {
    if (state.operational) {
      const fees = await API.get(
        `${process.env.VUE_APP_API_URL}api/v1/lnd/transaction/estimateFee`,
        {
          params: { address, confTarget, amt, sweep }
        }
      );

      if (fees) {
        commit("fees", fees);
      }
    }
  }
};

const getters = {
  status(state) {
    const data = {
      class: "loading",
      text: "Loading..."
    };

    if (state.operational) {
      data.class = "active";
      data.text = "Operational";
    }

    return data;
  },
  transactions(state) {
    const txs = [];

    //return default "loading" transactions until txs aren't fetched
    if (state.transactions && state.transactions.length && state.transactions[0]['type'] === 'loading') {
      return state.transactions;
    }

    if (state.transactions) {
      state.transactions.forEach(tx => {
        const amount = Number(tx.amount);

        let type = "incoming";
        if (amount < 0) {
          type = "outgoing";
        } else if (amount === 0) { //skip self incoming txs of change
          return;
        }

        let description = "Unknown";

        if (tx.type === "CHANNEL_OPEN" || tx.type === "PENDING_OPEN") {
          description = "Lightning Wallet";
        } else if (tx.type === "CHANNEL_CLOSE" || tx.type === "PENDING_CLOSE") {
          description = "Lightning Wallet";
        } else if (tx.type === "ON_CHAIN_TRANSACTION_SENT") {
          if (tx.numConfirmations > 0) {
            description = "Withdrawal";
          } else {
            description = "Pending Withdrawal";
          }
        } else if (tx.type === "ON_CHAIN_TRANSACTION_RECEIVED") {
          if (tx.numConfirmations > 0) {
            description = "Deposit";
          } else {
            description = "Pending Deposit";
          }
        }

        txs.push({
          type,
          amount: amount < 0 ? amount * -1 : amount, //for formatting +/- in view
          timestamp: new Date(Number(tx.timeStamp) * 1000),
          description,
          hash: tx.txHash,
          confirmations: tx.numConfirmations
        });
      });

      //sort txs by date
      txs.sort(function (tx1, tx2) {
        return tx2.timestamp - tx1.timestamp;
      });
    }

    return txs;
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
