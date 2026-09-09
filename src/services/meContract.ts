import { createPublicClient, http } from 'viem'
import { monadMainnet } from '../config/chain'
import { ME_ADDRESS } from '../config/contract'
import { ME_ABI } from '../abi/ME'

export const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(import.meta.env.VITE_RPC_URL),
})

export async function verifyMEContract() {
  const bytecode = await publicClient.getBytecode({
    address: ME_ADDRESS,
  })

  if (!bytecode || bytecode === '0x') {
    throw new Error('Không tìm thấy ME contract tại địa chỉ cấu hình')
  }

  const [baseMon, totalSupply] = await Promise.all([
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'BASE_MON',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'TOTAL_SUPPLY',
    }),
  ])

  const expectedBaseMon = 100000n * 10n ** 18n
  const expectedTotalSupply = 100000000000n * 10n ** 18n

  if (
    baseMon !== expectedBaseMon ||
    totalSupply !== expectedTotalSupply
  ) {
    throw new Error('Contract không khớp với ME contract mong đợi')
  }

  return true
}

export async function getCurrentPrice() {
  return publicClient.readContract({
    address: ME_ADDRESS,
    abi: ME_ABI,
    functionName: 'currentPrice',
  })
}
export async function getStats() {
  const [
    reserve,
    remaining,
    circulating,
    virtualReserve,
    actual,
    surplus,
    solvent,
  ] = await Promise.all([
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'reserveMON',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'remainingME',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'circulatingME',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'virtualReserveMON',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'actualMON',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'surplusMON',
    }),
    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'reserveSolvent',
    }),
  ])

  return {
    reserve,
    remaining,
    circulating,
    virtualReserve,
    actual,
    surplus,
    solvent,
  }
}

export async function getWalletBalances(address: `0x${string}`) {
  const [monBalance, meBalance] = await Promise.all([
    publicClient.getBalance({
      address,
    }),

    publicClient.readContract({
      address: ME_ADDRESS,
      abi: ME_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
  ])

  return {
    monBalance,
    meBalance,
  }
}

export async function quoteBuy(monIn: bigint) {
  return publicClient.readContract({
    address: ME_ADDRESS,
    abi: ME_ABI,
    functionName: 'quoteBuy',
    args: [monIn],
  })
}

export async function buyME(
  walletClient: any,
  account: `0x${string}`,
  monIn: bigint,
  minMeOut: bigint
) {
  const deadline =
    BigInt(Math.floor(Date.now() / 1000) + 20 * 60)

  const { request } = await publicClient.simulateContract({
    address: ME_ADDRESS,
    abi: ME_ABI,
    functionName: 'buyME',
    args: [
      minMeOut,
      deadline,
    ],
    value: monIn,
    account,
  })

  const hash = await walletClient.writeContract(request)

  return hash
}

export async function checkReserveSolvent() {
  return publicClient.readContract({
    address: ME_ADDRESS,
    abi: ME_ABI,
    functionName: 'reserveSolvent',
  })
}

export async function quoteSellFor(
  seller: `0x${string}`,
  meIn: bigint
) {
  return publicClient.readContract({
    address: ME_ADDRESS,
    abi: ME_ABI,
    functionName: 'quoteSellFor',
    args: [seller, meIn],
  })
}

export async function sellME(
  walletClient: any,
  account: `0x${string}`,
  meIn: bigint,
  minMonOut: bigint
) {
  const deadline =
    BigInt(Math.floor(Date.now() / 1000) + 20 * 60)

  const { request } = await publicClient.simulateContract({
    address: ME_ADDRESS,
    abi: ME_ABI,
    functionName: 'sellME',
    args: [
      meIn,
      minMonOut,
      deadline,
    ],
    account,
  })

  const hash = await walletClient.writeContract(request)

  return hash
}
