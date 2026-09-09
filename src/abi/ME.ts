export const ME_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
    ],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'TOTAL_SUPPLY',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'BASE_MON',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'reserveMON',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'remainingME',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'circulatingME',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'virtualReserveMON',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'actualMON',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'surplusMON',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'reserveSolvent',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'bool' },
    ],
  },

  {
    type: 'function',
    name: 'currentPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [
      { name: 'monIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'meOut', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [
      { name: 'meIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'monOut', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'quoteSellFor',
    stateMutability: 'view',
    inputs: [
      { name: 'seller', type: 'address' },
      { name: 'meIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'monOut', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'buyME',
    stateMutability: 'payable',
    inputs: [
      { name: 'minMeOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'meOut', type: 'uint256' },
    ],
  },

  {
    type: 'function',
    name: 'sellME',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'meIn', type: 'uint256' },
      { name: 'minMonOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'monOut', type: 'uint256' },
    ],
  },

  {
    type: 'event',
    name: 'Buy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'monIn', type: 'uint256', indexed: false },
      { name: 'meOut', type: 'uint256', indexed: false },
      { name: 'reserveAfter', type: 'uint256', indexed: false },
      { name: 'remainingMEAfter', type: 'uint256', indexed: false },
    ],
  },

  {
    type: 'event',
    name: 'Sell',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'meIn', type: 'uint256', indexed: false },
      { name: 'monOut', type: 'uint256', indexed: false },
      { name: 'reserveAfter', type: 'uint256', indexed: false },
      { name: 'remainingMEAfter', type: 'uint256', indexed: false },
    ],
  },
] as const
