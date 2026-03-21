# Installation

## Python

```bash
pip install elevenlabs
```

```python
from elevenlabs import ElevenLabs

# Option 1: Environment variable (recommended)
# Set ELEVENLABS_API_KEY in your environment
client = ElevenLabs()

# Option 2: Pass directly
client = ElevenLabs(api_key="your-api-key")
```

## JavaScript / TypeScript

```bash
npm install @elevenlabs/elevenlabs-js
```

```javascript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Option 1: Environment variable (recommended)
const client = new ElevenLabsClient();

// Option 2: Pass directly
const client = new ElevenLabsClient({ apiKey: "your-api-key" });
```

## cURL / REST API

```bash
export ELEVENLABS_API_KEY="your-api-key"

curl -X POST "https://api.elevenlabs.io/v1/sound-generation" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "Thunder rumbling in the distance"}' --output output.mp3
```

## Getting an API Key

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Go to [API Keys](https://elevenlabs.io/app/settings/api-keys)
3. Click **Create API Key**
4. Copy and store securely
