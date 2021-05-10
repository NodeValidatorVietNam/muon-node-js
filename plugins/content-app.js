const BaseApp = require('./base/base-app-plugin')
const CID = require('cids')
const NodeUtils = require('../utils/node-utils')
const fs = require('fs')
const chokidar = require('chokidar');
const all = require('it-all')
const {remoteApp, remoteMethod, gatewayMethod} = require('./base/app-decorators')

@remoteApp
class ContentApp extends BaseApp {
  APP_NAME = 'content'
  watcher = null;

  async onNewFileAdd(path){
    // console.log('Request File', path, 'has been added')
    let cidStr = new CID(path.split('.')[0]);
    await this.muon.libp2p.contentRouting.provide(cidStr)
  }

  onFileRemove(path){
    // console.log('Request File', path, 'has been removed');
  }

  async onRequestSigned(request){
    let content = JSON.stringify(request);
    let cid = await NodeUtils.stock.createCID(request)
    fs.writeFileSync(`./data/${cid.toString()}.req`, content)
  }

  async onStart() {
    this.muon.getPlugin('stock-plugin').on('request-signed', this.onRequestSigned.bind(this))

    this.watcher = chokidar.watch('*.req', {
      // ignored: /^\./,
      ignoreInitial: false,
      persistent: true,
      depth: 2,
      cwd: `./data`
    });
    this.watcher
      .on('add', this.onNewFileAdd.bind(this))
      .on('unlink', this.onFileRemove.bind(this))

  }

  @gatewayMethod('get_content')
  async responseToGatewayRequestData(data){
    let filePath = `./data/${data.cid}.req`
    if(fs.existsSync(filePath, 'utf8')){
      console.log('file exist')
      let content = fs.readFileSync(filePath)
      let requestData = JSON.parse(content)
      return requestData
    }
    else{
      console.log('file not exist')
      let cid = new CID(data.cid);
      let providers = await all(this.muon.libp2p.contentRouting.findProviders(cid, {timeout: 5000}))
      for(let provider of providers){
        if(provider.id.toB58String() !== process.env.PEER_ID){
          let peer = await this.muon.libp2p.peerRouting.findPeer(provider.id);
          let request = await this.remoteCall(peer, 'get_content', data)
          // let request = await NodeUtils.getRequestInfo(data.id)
          return request
        }
      }
      return null
    }
  }

  @remoteMethod('get_content')
  async responseToRemoteRequestData(data){
    let filePath = `./data/${data.cid}.req`
    if(fs.existsSync(filePath, 'utf8')){
      let content = fs.readFileSync(filePath)
      return JSON.parse(content)
    }
    else{
      return null
    }
  }
}

module.exports = ContentApp;