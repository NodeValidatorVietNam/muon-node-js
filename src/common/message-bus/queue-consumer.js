const BaseMessageQueue = require('./base-message-queue')
const { promisify } = require("util");

class QueueConsumer extends BaseMessageQueue {

  options = {}
  _reading = false;

  constructor(busName, options={}) {
    super(busName);

    this.options = options;
  }

  on(eventName, listener) {
    super.on(eventName, listener);
    if(!this._reading){
      this._reading = true;
      this.readQueuedMessages();
    }
  }

  async readQueuedMessages() {
    // const blpopAsync = promisify(this.receiveRedis.blpop).bind(this.receiveRedis);
    const sendCommand = promisify(this.receiveRedis.sendCommand).bind(this.receiveRedis);
    while (true) {
      try {
        // let [queue, dataStr] = await blpopAsync(this.channelName, 0)
        let [queue, dataStr] = await sendCommand("BLPOP", [`${this.channelName}@${process.pid}`, this.channelName, '0'])
        this.onMessageReceived(queue, dataStr);
      } catch (e) {
        console.error(e)
      }
    }
  }

  async onMessageReceived(channel, strMessage) {
    let {pid, uid, data} = JSON.parse(strMessage)
    let response, error;
    try {
      response = await this.emit("message", data, {pid, uid})
    } catch (e) {
      // console.log(`QueueConsumer.onMessageReceived`, e);
      error = typeof e === "string" ? {message: e} : e;
    }
    this.responseTo(pid, uid, {response, error});
  }

  /**
   * @param {Object} message
   * @param {Object} options
   * @returns {Promise<void>}
   */
  responseTo(pid, responseId, data, options={}){
    const receivingProcessChannel = this.getProcessResponseChannel(pid);
    let wMsg = this.wrapData(data, {uid: responseId});
    this.sendRedis.publish(receivingProcessChannel, JSON.stringify(wMsg));
  }
}

module.exports = QueueConsumer;
