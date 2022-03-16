const {
  Multicall,
  ContractCallResults,
  ContractCallContext
} = require('ethereum-multicall')
const { getWeb3 } = require('./node-utils/eth')

async function multiCall(chainId, contractCallContext) {
  const web3 = await getWeb3(chainId)
  const multicall = new Multicall({ web3Instance: web3, tryAggregate: true })
  let { results } = await multicall.call(contractCallContext)
  results = contractCallContext.map((item) => ({
    reference: item.reference,
    contractAddress: item.contractAddress,
    callsReturnContext: results[item.reference]['callsReturnContext']
  }))
  return results
}

module.exports = { multiCall }

// Example

// const contractCallContext = [
//     {
//       reference: 'BloodToken',
//       contractAddress: '0xc3b99c2a46b8DC82C96B8b61ED3A4c5E271164D7',
//       abi: [
//         {
//           inputs: [
//             { internalType: 'address', name: 'account', type: 'address' }
//           ],
//           name: 'balanceOf',
//           outputs: [
//             { internalType: 'uint256', name: '', type: 'uint256' }
//           ],
//           stateMutability: 'view',
//           type: 'function'
//         }
//       ],
//       calls: [
//         {
//           reference: 'bloodTokenBalance',
//           methodName: 'balanceOf',
//           methodParameters: [account]
//         }
//       ]
//     },
//     {
//       reference: 'MuonSwapPair',
//       contractAddress: '0xC233Cce22a0E7a5697D01Dcc6be93DA14BfB3761',
//       abi: [
//         {
//           inputs: [
//             { internalType: 'address', name: 'account', type: 'address' }
//           ],
//           name: 'balanceOf',
//           outputs: [
//             { internalType: 'uint256', name: '', type: 'uint256' }
//           ],
//           stateMutability: 'view',
//           type: 'function'
//         },
//         {
//           inputs: [],
//           name: 'symbol',
//           outputs: [{ internalType: 'string', name: '', type: 'string' }],
//           stateMutability: 'view',
//           type: 'function'
//         }
//       ],
//       calls: [
//         {
//           reference: 'muonSwapBalance',
//           methodName: 'balanceOf',
//           methodParameters: [account]
//         },
//         {
//           reference: 'muonSwapSymbol',
//           methodName: 'symbol'
//         }
//       ]
//     }
//   ]
