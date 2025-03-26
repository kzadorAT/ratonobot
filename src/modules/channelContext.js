// channelContext.js

const channelContexts = {};
const contextSize = 5;

function updateChannelContext(channelId, message) {
    if (!channelContexts[channelId]) {
        channelContexts[channelId] = [];
    }

    if (channelContexts[channelId].length >= contextSize) {
        channelContexts[channelId].shift();
    }

    channelContexts[channelId].push(message);
}

function getChannelContext(channelId) {
    return channelContexts[channelId] || [];
}

module.exports = {
    updateChannelContext,
    getChannelContext
};
