# Memory MCP Server

An MCP server implementation that provides persistent key-value storage capabilities.

## Features
- **Persistent Storage**: Data is saved to disk and persists between sessions
- **Simple Interface**: Store and retrieve data with simple commands
- **Automatic Detection**: The bot automatically detects when to use memory operations

## Tools
### save_memory
Store key-value pairs in persistent memory

**Inputs:**
- `key` (string): Unique identifier for the data
- `value` (string): Data to be stored

### recall_memory  
Retrieve data from persistent memory by key

**Inputs:**
- `key` (string): Key to retrieve

## Usage Examples
- "guarda esto en memoria: clave valor"
- "recuerda clave"

## Configuration
The memory file is stored at `data/memory.json` by default. To change this:

1. Edit `src/modules/mcp/clients.json`:
```json
{
  "configuration": {
    "filePath": "your/custom/path.json"
  }
}
```

2. Ensure the directory exists and is writable

## Integration
The memory tools are automatically available when:
1. The MCP server is running
2. The bot detects memory-related commands
3. The user has proper permissions
