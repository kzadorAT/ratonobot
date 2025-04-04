module.exports = {
  mockDiscordClient: {
    channels: {
      cache: {
        get: jest.fn().mockImplementation((channelId) => ({
          messages: {
            fetch: jest.fn().mockResolvedValue({
              array: jest.fn().mockReturnValue([
                {
                  id: 'msg1',
                  content: 'Test message 1',
                  author: { id: 'user1' },
                  filter: jest.fn().mockReturnValue([])
                }
              ]),
              filter: jest.fn().mockReturnValue({
                array: jest.fn().mockReturnValue([])
              })
            })
          }
        }))
      }
    }
  }
};
