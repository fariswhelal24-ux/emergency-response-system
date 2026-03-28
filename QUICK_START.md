# 🚀 Quick Start - Arabic AI Medical Assistant

## ⏱️ 5 Minute Setup

### Step 1: Get OpenAI API Key
1. Go to https://platform.openai.com/api/keys
2. Create new secret key
3. Copy the key (you won't see it again)

### Step 2: Configure Environment
```bash
cd services/api

# Create/edit .env file
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
```

### Step 3: Setup Database
```bash
# Run migrations to create AI tables
pnpm run migrate
```

### Step 4: Install & Start
```bash
# Install packages (if not done)
pnpm install

# Start backend server
pnpm run dev
```

✅ Server should be running on `http://localhost:4100`

---

## 🧪 Test the System

### Option 1: Using cURL
```bash
# Get auth token first (from your user auth)
BEARER_TOKEN="your_jwt_token_here"

# Send a message
curl -X POST http://localhost:4100/api/v1/ai/chat \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "عندي حمى عالية"
  }'
```

### Option 2: Using the test script
```bash
# Make script executable
chmod +x test-ai-api.sh

# Run tests (update AUTH_TOKEN first)
bash test-ai-api.sh
```

### Option 3: Using Postman
1. Import the collection from `test-ai-api.sh`
2. Set `Authorization` header with your JWT token
3. Send requests to `http://localhost:4100/api/v1/ai/*`

---

## 📱 Integrate with Mobile App

### In MedicalChatScreen.tsx

```typescript
import axios from 'axios';

// After user sends message
const sendMessage = async (text: string) => {
  try {
    const response = await axios.post(
      'http://your-api-url/api/v1/ai/chat',
      { message: text },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { response: aiReply, analysis } = response.data.data;

    // Handle emergency
    if (analysis.isEmergency) {
      Alert.alert('🚨 طوارئ', 'يرجى const ambulance فوراً');
    }

    // Show AI response
    setMessages(prev => [...prev, {
      role: 'assistant',
      text: aiReply,
      isTyping: false
    }]);

  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

## 🎨 Features You Get

✅ **Full Arabic Support**
- MSA and dialects
- Diacritic handling
- Dialect normalization

✅ **Smart Processing**
- Spell correction
- Intent detection
- Medical entity extraction
- Emergency detection

✅ **AI-Powered**
- OpenAI GPT-4
- Context awareness
- Multi-turn conversations
- Safe medical responses

✅ **Data Management**
- Persistent conversations
- Full-text search
- User statistics
- Automatic cleanup

---

## 📊 API Response Example

```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "msg_xxx",
      "role": "user",
      "content": "عندي حمى عالية جداً",
      "language": "ar"
    },
    "assistantMessage": {
      "id": "msg_yyy",
      "role": "assistant",
      "content": "أفهم قلقك. الحمى العالية تتطلب...",
      "language": "ar"
    },
    "analysis": {
      "intent": "medical_question",
      "confidence": 0.95,
      "keywords": ["حمى", "عالية"],
      "entities": {
        "symptoms": ["حمى"],
        "bodyParts": [],
        "medicines": []
      },
      "isEmergency": false,
      "preprocessed": true,
      "language": "ar"
    }
  }
}
```

---

## 🔧 Common Issues

### ❌ "OPENAI_API_KEY is not set"
```bash
# Add to .env in services/api/
OPENAI_API_KEY=sk-your-key-here
```

### ❌ "Database connection failed"
```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Run migrations
pnpm run migrate
```

### ❌ "401 Unauthorized"
```bash
# Make sure JWT token is valid
# Include in headers: Authorization: Bearer YOUR_TOKEN
```

### ❌ "502 Bad Gateway"
```bash
# Check backend server is running
# Check ports are not blocked
# Review server logs
```

---

## 📚 Documentation

- **Full Guide:** `AI_ASSISTANT_GUIDE.md`
- **Architecture:** `ARCHITECTURE.md`
- **Examples:** `USAGE_EXAMPLES.ts`
- **API Tests:** `test-ai-api.sh`

---

## 🎯 Next Steps

1. ✅ Setup backend (you're here)
2. 📱 Integrate with mobile app
3. 🧪 Test with real users
4. 📊 Monitor usage and feedback
5. 🚀 Deploy to production

---

## 💡 Pro Tips

**Tip 1:** Cache medical terms for faster lookups
```typescript
const medicalCache = new Map();
```

**Tip 2:** Batch OpenAI requests to save costs
```typescript
// Group similar requests
const batch = await Promise.all([
  getResponse(msg1),
  getResponse(msg2)
]);
```

**Tip 3:** Monitor token usage
```typescript
console.log('Tokens used:', response.tokens);
```

**Tip 4:** Add rate limiting per user
```typescript
const userLimit = rateLimit({ windowMs: 60000, limit: 30 });
```

---

## 🔗 Useful Links

- OpenAI Dashboard: https://platform.openai.com
- API Documentation: https://platform.openai.com/docs/api-reference
- Status Page: https://status.openai.com
- Support: https://help.openai.com

---

**🎉 You're ready to go!**

Start chatting with your Arabic AI medical assistant now.
