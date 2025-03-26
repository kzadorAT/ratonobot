// messageQueue.js

const maxQueueSize = 4;

const messageQueue = [];

function addMessage(message) {
    if (messageQueue.length >= maxQueueSize) {
        messageQueue.shift();
    }
    messageQueue.push(message);
}

function processQueue(callback) {
    while (messageQueue.length > 0) {
        const message = messageQueue.shift();
        callback(message);
    }
}

module.exports = {
    addMessage,
    processQueue
};
