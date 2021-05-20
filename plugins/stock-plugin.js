const BaseApp = require('./base/base-app-plugin')
const Request = require('../gateway/models/Request')
const Signature = require('../gateway/models/Signature')
const NodeUtils = require('../utils/node-utils')
const Sources = require('../gateway/sources')
const {omit} = require('lodash')
const all = require('it-all')
const {getTimestamp} = require('../utils/helpers')
const {remoteApp, remoteMethod, gatewayMethod} = require('./base/app-decorators')

@remoteApp
class StockPlugin extends BaseApp {
  APP_BROADCAST_CHANNEL = 'muon/stock/request/broadcast'
  APP_NAME = 'stock'
  serviceId=null
  serviceProviders = []

  constructor(...args) {
    super(...args);
  }

  async onStart(){
    super.onStart();
    this.initializeService()
  }

  async initializeService(){
    let serviceCID = await NodeUtils.common.strToCID(this.APP_BROADCAST_CHANNEL)
    await this.muon.libp2p.contentRouting.provide(serviceCID)
    this.serviceId = serviceCID
    // console.log({serviceCID: serviceCID.toString()})
    setTimeout(this.updatePeerList.bind(this), 9000);
  }

  async updatePeerList(){
    // console.log('TestPlugin updating peer list ...')
    try {
      let providers = await all(this.muon.libp2p.contentRouting.findProviders(this.serviceId, {timeout: 5000}))
      let otherProviders = providers.filter(({id}) => (id._idB58String !== process.env.PEER_ID))

      // console.log(`providers :`,otherProviders)
      for (let provider of otherProviders) {

        let strPeerId = provider.id.toB58String();
        if (strPeerId === process.env.PEER_ID)
          continue;

        // console.log('pinging ', strPeerId)
        const latency = await this.muon.libp2p.ping(provider.id)
        // console.log({latency})
      }
      this.serviceProviders = otherProviders;
    }
    catch (e) {
      console.log('stock-plugin updatePeerList error', e)
    }

    setTimeout(this.updatePeerList.bind(this), 30000)
  }

  @gatewayMethod('get_price')
  async onGetPrice(data){
    let {symbol, source = "finnhub"} = data || {}
    if (!symbol) {
      throw {message: "Missing symbol param"}
    }
    let price = await Sources.getSymbolPrice(symbol, source)
    if (!price) {
      throw {"message": "Price not found"}
    }

    let startedAt = getTimestamp();
    let newRequest = new Request({
      app: 'stock',
      method: 'get_price',
      owner: process.env.SIGN_WALLET_ADDRESS,
      peerId: process.env.PEER_ID,
      data: {
        symbol: symbol,
        price: price['price'],
        timestamp: price['timestamp'],
        source: source,
        rawPrice: price,
      },
      startedAt,
    })
    await newRequest.save()
    let sign = NodeUtils.stock.signRequest(newRequest, price);
    (new Signature(sign)).save()

    // this.broadcastNewRequest({
    //   type: 'new_request',
    //   peerId:  process.env.PEER_ID,
    //   _id: newRequest._id
    // })
    this.serviceProviders.map(async provider => {
      this.remoteCall(provider, 'wantSign', newRequest)
        .then(sign => {
          // console.log('wantSign response', sign);
          (new Signature(sign)).save();
        })
    })

    let [confirmed, signatures] = await this.isOtherNodesConfirmed(newRequest, parseInt(process.env.NUM_SIGN_TO_CONFIRM))

    if(confirmed){
      newRequest['confirmedAt'] = getTimestamp()
    }

    let requestData = {
      confirmed,
      ...omit(newRequest._doc, ['__v', 'data.source', 'data.rawPrice']),
      signatures,
    }

    if (confirmed) {
      newRequest.save()
      await this.emit('request-signed', requestData)
    }

    return {
      cid: await NodeUtils.stock.createCID(requestData),
      ...requestData
    }
  }

  recoverSignature(request, sig) {
    return NodeUtils.stock.recoverSignature(request, sig)
  }

  async processRemoteRequest(request) {
    let {symbol, source} = request['data']
    let priceResult = await Sources.getSymbolPrice(symbol, source)
    if (!priceResult) {
      throw {"message": "Price not found"}
    }
    let priceDiff = Math.abs(priceResult['price'] - request['data']['price'])
    if(priceDiff/request['data']['price'] > parseFloat(process.env.PRICE_TOLERANCE)){
      throw {message: "Price threshold exceeded"}
    }

    let sign = NodeUtils.stock.signRequest(request, priceResult)
    return sign
  }


  @remoteMethod('wantSign')
  async remoteWantSign(request){
    let sign = await this.processRemoteRequest(request)
    // console.log('wantSign', request._id, sign)
    return sign;
  }
}

module.exports = StockPlugin;
