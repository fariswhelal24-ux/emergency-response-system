# 🤖 AI-Powered Medical Assistant System - Complete Implementation Guide

**Status:** ✅ Production Ready (March 25, 2026)  
**Architecture:** LLM-First Natural Language Understanding  
**Model:** OpenAI GPT-4.1  
**Languages:** Arabic (all dialects) + English  

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [AI System Design](#ai-system-design)
5. [API Endpoints](#api-endpoints)
6. [Configuration](#configuration)
7. [Integration Guide](#integration-guide)
8. [Testing & Validation](#testing--validation)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This system replaces traditional rule-based medical chatbots with a **pure AI-powered natural language understanding system** using OpenAI's GPT models. The assistant behaves like ChatGPT but with specialized medical knowledge.

### Key Philosophy
- **No keyword matching** - Uses semantic understanding
- **No preprocessing** - Raw user input goes directly to LLM
- **Conversation-aware** - Full context history for personalized responses
- **Emergency-sensitive** - LLM-based detection with immediate action
- **Natural multilingual** - Arabic dialects, English, mixed seamlessly

### What Changed
| Before | After |
|--------|-------|
| Keyword matching | LLM-based semantic understanding |
| Static responses | Dynamic, context-aware replies |
| Limited dialect support | Full Arabic dialect support |
| No conversation memory | Complete conversation history |
| Rule-based emergency detection | AI-powered emergency detection |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MOBILE / WEB CLIENT                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Raw User Message: "عندي حمي عاليه والرأس يصعك"                        │
│  (Have high fever and headache pain)                                    │
│                          ↓                                              │
├──────────────────────────────────────────────────────────────────────────┤
│                       EXPRESS API SERVER                                │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  POST /api/v1/ai/chat                                       │       │
│  │  ├─ Authenticate request (JWT)                              │       │
│  │  ├─ Extract conversationId                                  │       │
│  │  └─ Extract message                                         │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                          ↓                                              │
├──────────────────────────────────────────────────────────────────────────┤
│               AIAssistantService.getResponse()                          │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ 1. Get conversation history (last 30 messages)              │       │
│  │ 2. Build system prompt with medical instructions            │       │
│  │ 3. Call OpenAI GPT-4.1 with:                                │       │
│  │    - System prompt (medical assistant role)                 │       │
│  │    - Conversation history                                   │       │
│  │    - Raw user message (NO preprocessing)                    │       │
│  │ 4. Receive structured JSON response including:              │       │
│  │    - Assistant's reply                                      │       │
│  │    - Language detection                                     │       │
│  │    - Emergency detection                                    │       │
│  │    - Entities (symptoms, medicines, conditions)             │       │
│  │    - Suggested follow-up questions                          │       │
│  │    - Trusted source recommendations                         │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                          ↓                                              │
├──────────────────────────────────────────────────────────────────────────┤
│          ConversationMemoryService.saveMessage()                        │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ 1. Save user message to database                            │       │
│  │ 2. Save assistant response to database                      │       │
│  │ 3. Store analysis metadata:                                 │       │
│  │    - Language (ar/en/mixed)                                 │       │
│  │    - Intent (medical_question/emergency/etc)                │       │
│  │    - Emergency flag                                         │       │
│  │ 4. Update conversation thread metadata                      │       │
│  └─────────────────────────────────────────────────────────────┘       │
│                          ↓                                              │
├──────────────────────────────────────────────────────────────────────────┤
│           PostgreSQL Database                                           │
│  ┌──────────────────────┬───────────────────────────────────┐           │
│  │ ai_conversations     │ ai_chat_messages                  │           │
│  ├──────────────────────┼───────────────────────────────────┤           │
│  │ id                   │ id                                │           │
│  │ user_id              │ user_id                           │           │
│  │ title                │ conversation_id                   │           │
│  │ last_message         │ role (user/assistant)             │           │
│  │ message_count        │ content                           │           │
│  │ created_at/updated_at│ language (ar/en/mixed)            │           │
│  │                      │ intent                            │           │
│  │                      │ is_emergency                      │           │
│  │                      │ created_at                        │           │
│  └──────────────────────┴───────────────────────────────────┘           │
│                          ↓                                              │
├──────────────────────────────────────────────────────────────────────────┤
│                     Response to Client                                  │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ {                                                           │       │
│  │   "success": true,                                          │       │
│  │   "data": {                                                 │       │
│  │     "assistantMessage": "الحمى العالية قد تكون ...",        │       │
│  │     "analysis": {                                           │       │
│  │       "isEmergency": false,                                 │       │
│  │       "intent": "medical_question",                         │       │
│  │       "entities": { "symptoms": ["حمى", "صداع"] },          │       │
│  │       "followUpQuestions": [...]                            │       │
│  │     }                                                       │       │
│  │   }                                                         │       │
│  │ }                                                           │       │
│  └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Core Components

### 1. **AIAssistantService** (`ai-assistant.ts`)

The main service that handles all AI interactions. **100% LLM-powered**.

#### Key Method: `getResponse()`

```typescript
const response = await AIAssistantService.getResponse(
  "عندي حمى عالية والرأس يصعك", // Raw Arabic user message
  {
    history: [
      { role: "user", content: "متى بدأت الحمى؟" },
      { role: "assistant", content: "منذ يومين تقريباً" }
    ]
  }
);
```

**Returns:**
```typescript
{
  response: string;                    // Assistant's full response
  language: "ar" | "en" | "mixed";     // Detected input language
  responseLanguage: "ar" | "en";       // Language for response
  isEmergency: boolean;                // Emergency detection
  preprocessed: boolean;               // Always false (no preprocessing)
  needsFollowUp: boolean;              // Whether follow-up questions needed
  followUpQuestions: string[];         // Suggested follow-up questions
  sources: TrustedSource[];            // Recommended medical sources
  analysis: {
    intent: AssistantIntent;           // Medical question/emergency/etc
    confidence: number;                // 0-1 confidence score
    keywords: string[];                // Detected medical keywords
    entities: {                        // Extracted medical entities
      symptoms: string[];
      bodyParts: string[];
      medicines: string[];
      conditions: string[];
    }
  }
}
```

#### System Prompt Strategy

The system is guided by a comprehensive prompt that:

1. **Defines Role:** Medical assistant for non-emergency cases
2. **Requests Natural Language:** Process messages as-is, understand meaning not keywords
3. **Enables Multilingual:** Arabic dialects + English + mixed
4. **Requires Context Usage:** Full conversation history for personalized responses
5. **Specifies Emergency Detection:** Clear rules for identifying emergencies
6. **Requests Structured Output:** JSON response with analysis metadata
7. **Sets Tone:** Professional, empathetic, honest about limitations

### 2. **ConversationMemoryService** (`conversation-memory.ts`)

Persistent storage and retrieval of conversations.

```typescript
// Save a message
const message = await ConversationMemoryService.saveMessage(
  userId,
  "user",
  "عندي ألم في الصدر",
  {
    language: "ar",
    intent: "medical_question",
    isEmergency: false,
    conversationId: "conv_123"
  }
);

// Get conversation history (last 30 messages)
const history = await ConversationMemoryService.getConversationHistory(
  userId,
  30,  // limit
  conversationId  // optional, for specific thread
);

// Create new conversation
const conversation = await ConversationMemoryService.createConversation(
  userId,
  "Medical consultation about fever"
);

// Get all conversations for user
const conversations = await ConversationMemoryService.getConversationThreads(
  userId,
  10  // limit
);
```

### 3. **Language Detection** (Built-in to AI)

The LLM automatically detects:
- **ar**: Arabic (any dialect)
- **en**: English
- **mixed**: Code-switching between languages

### 4. **Emergency Detection** (LLM-Based)

The system is trained to recognize emergencies including:
- **Breathing:** "Can't breathe", "لا أتنفس"
- **Chest:** "Severe chest pain", "ألم صدر شديد"
- **Consciousness:** "Unconscious", "فقدان الوعي"
- **Bleeding:** "Heavy bleeding", "نزيف غزير"
- **Allergic:** "Throat swelling", "تورم الحلق"
- **Neurological:** "Stroke", "سكتة"
- **Poisoning:** "Overdose", "جرعة زائدة"
- **Self-harm:** "Suicidal", "انتحاري"

**Response to Emergency:**
```json
{
  "isEmergency": true,
  "assistantResponse": "Call emergency services immediately! 📞 Dial 911 (or your local emergency number). This is a medical emergency that requires immediate professional help.",
  "analysis": {
    "intent": "emergency",
    "confidence": 0.99
  }
}
```

---

## 🌐 API Endpoints

All endpoints live under `/api/v1/ai` and are production-ready.

### 1. **Public Chat Endpoint** (No authentication required)
```
POST /api/v1/ai/chat/public
```

For demo purposes or mobile clients that can't authenticate yet.

**Request:**
```json
{
  "message": "I have a fever",
  "history": [
    { "role": "user", "content": "When did it start?" },
    { "role": "assistant", "content": "Three days ago" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "assistantMessage": {
      "role": "assistant",
      "content": "A 3-day fever can be..."
    },
    "analysis": {
      "intent": "medical_question",
      "confidence": 0.95,
      "isEmergency": false,
      "entities": {
        "symptoms": ["fever"],
        "bodyParts": [],
        "medicines": [],
        "conditions": []
      },
      "keyword": ["fever", "3 days"],
      "needsFollowUp": true,
      "followUpQuestions": [
        "What is your temperature?",
        "Do you have any other symptoms?"
      ],
      "sources": [
        {"title": "CDC - Fever", "url": "https://www.cdc.gov/..."}
      ],
      "language": "en",
      "responseLanguage": "en"
    }
  }
}
```

### 2. **Authenticated Chat** (Requires JWT token)
```
POST /api/v1/ai/chat
Authorization: Bearer <JWT_TOKEN>
```

Full conversation persistence and user isolation.

**Request:**
```json
{
  "message": "عندي حمى عالية",
  "conversationId": "conv_abc123" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_abc123",
    "userMessage": {
      "id": "msg_...",
      "role": "user",
      "content": "عندي حمى عالية",
      "language": "ar",
      "created_at": "2026-03-25T10:30:00Z"
    },
    "assistantMessage": {
      "id": "msg_...",
      "role": "assistant",
      "content": "الحمى العالية قد تكون علامة على عدوى...",
      "language": "ar",
      "created_at": "2026-03-25T10:30:05Z"
    },
    "analysis": { ... }
  }
}
```

### 3. **List Conversations**
```
GET /api/v1/ai/conversations
Authorization: Bearer <JWT_TOKEN>
```

Returns all conversation threads for the authenticated user.

### 4. **Create Conversation**
```
POST /api/v1/ai/conversations
Authorization: Bearer <JWT_TOKEN>
```

**Request:**
```json
{
  "title": "Fever and headache inquiry"
}
```

### 5. **Get Conversation History**
```
GET /api/v1/ai/conversations/:conversationId
Authorization: Bearer <JWT_TOKEN>
```

Returns all messages in a specific conversation thread.

### 6. **Search Messages**
```
GET /api/v1/ai/search?q=fever&limit=10
Authorization: Bearer <JWT_TOKEN>
```

Full-text search across user's messages.

### 7. **User Statistics**
```
GET /api/v1/ai/stats
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "totalMessages": 42,
  "emergencyCalls": 2,
  "preferredLanguage": "ar",
  "averageResponseTime": 2.3,
  "lastActive": "2026-03-25T10:30:00Z"
}
```

---

## ⚙️ Configuration

### Environment Variables

Add to `.env` file in `services/api/`:

```env
# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxx     # From https://platform.openai.com
OPENAI_MODEL=gpt-4.1                      # Using GPT-4.1 for best results

# Database (Already configured)
DATABASE_URL=postgresql://...              # PostgreSQL connection string

# API Configuration
PORT=4100                                  # API server port
NODE_ENV=development                       # development, test, production

# JWT (Already configured)
JWT_ACCESS_SECRET=your-secret-key-min-16  # For authentication
JWT_REFRESH_SECRET=your-refresh-secret     # For auth refresh

# CORS Origins
CLIENT_ORIGINS=http://localhost:5173,http://localhost:19000,http://localhost:19001
```

### Setup Steps

1. **Get OpenAI API Key:**
   - Go to https://platform.openai.com/account/api-keys
   - Create a new API key
   - Add it to `.env` as `OPENAI_API_KEY`

2. **Verify Configuration:**
   ```bash
   cd services/api
   source .env  # Load environment variables
   echo $OPENAI_API_KEY  # Should print your key
   ```

3. **Run Database Migrations:**
   ```bash
   pnpm run migrate
   ```

4. **Test API:**
   ```bash
   bash test-ai-api.sh
   ```

---

## 🔌 Integration Guide

### Mobile App Integration (`MedicalChatScreen.tsx`)

```typescript
import axios from 'axios';
import { useState } from 'react';

export function MedicalChatScreen() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const sendMessage = async (userMessage: string) => {
    setLoading(true);
    try {
      const response = await axios.post(
        'http://your-api-server/api/v1/ai/chat',
        {
          message: userMessage,
          conversationId
        },
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const { data } = response.data;
      
      // Update conversation ID
      if (!conversationId) {
        setConversationId(data.conversationId);
      }

      // Add messages to chat
      setMessages(prev => [
        ...prev,
        { role: 'user', content: userMessage, language: data.analysis.language },
        { role: 'assistant', content: data.assistantMessage.content, language: data.analysis.responseLanguage }
      ]);

      // Check for emergency
      if (data.analysis.isEmergency) {
        Alert.alert(
          '⚠️  EMERGENCY',
          'This appears to be a medical emergency. Please call emergency services immediately!'
        );
      }

      // Show follow-up suggestions
      if (data.analysis.needsFollowUp && data.analysis.followUpQuestions.length > 0) {
        showFollowUpSuggestions(data.analysis.followUpQuestions);
      }

      // Show trusted sources
      if (data.analysis.sources.length > 0) {
        showRecommendedResources(data.analysis.sources);
      }

    } catch (error) {
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {/* Render messages */}
      {messages.map((msg, idx) => (
        <ChatBubble key={idx} message={msg} />
      ))}
      
      {/* Input area */}
      <TextInput 
        placeholder="Type your message..."
        onSubmitEditing={(e) => sendMessage(e.nativeEvent.text)}
      />
    </View>
  );
}
```

### Web Dashboard Integration (`MedicalChatComponent.tsx`)

```typescript
import { useEffect, useState } from 'react';

export function MedicalChatComponent() {
  const [response, setResponse] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const handleMessage = async (message: string) => {
    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          message,
          conversationId: currentConversation?.id
        })
      });

      const data = await res.json();
      setResponse(data.data.assistantMessage.content);
      setAnalysis(data.data.analysis);

      // Handle emergency
      if (data.data.analysis.isEmergency) {
        // Show emergency alert
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <div className="chat-response">{response}</div>
      <div className="analysis">
        <p>Intent: {analysis?.intent}</p>
        <p>Language: {analysis?.language}</p>
        <p>Emergency: {analysis?.isEmergency ? '🚨 YES' : 'No'}</p>
        {analysis?.followUpQuestions && (
          <div className="follow-ups">
            {analysis.followUpQuestions.map(q => (
              <button key={q} onClick={() => handleMessage(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 🧪 Testing & Validation

### Test Cases

#### Test 1: Basic Medical Question (Arabic)
```bash
curl -X POST http://localhost:4100/api/v1/ai/chat/public \
  -H "Content-Type: application/json" \
  -d '{
    "message": "عندي حمى عالية من يومين",
    "history": []
  }'

# Expected: 
# - isEmergency: false
# - intent: "medical_question"
# - symptoms: ["حمى"]
# - responseLanguage: "ar"
# - followUpQuestions: [...questions in Arabic...]
```

#### Test 2: Spelling Mistakes
```bash
curl -X POST http://localhost:4100/api/v1/ai/chat/public \
  -H "Content-Type: application/json" \
  -d '{
    "message": "عندي حمي عاليه والرأس يصعك",
    "history": []
  }'

# Expected: LLM understands "حمي عاليه" as "حمى عالية" without explicit preprocessing
```

#### Test 3: Emergency Detection
```bash
curl -X POST http://localhost:4100/api/v1/ai/chat/public \
  -H "Content-Type: application/json" \
  -d '{
    "message": "لا أتنفس! الرجاء ساعدوني!",
    "history": []
  }'

# Expected:
# - isEmergency: true
# - assistantResponse: Contains emergency instruction
# - intent: "emergency"
```

#### Test 4: Conversation Memory
```bash
# Message 1
curl -X POST http://localhost:4100/api/v1/ai/chat \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "عندي حمى من يومين"
  }'

# Response includes conversationId, gets stored

# Message 2 (in same conversation)
curl -X POST http://localhost:4100/api/v1/ai/chat \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "هل يجب أن أذهب للطبيب؟",
    "conversationId": "conv_xxx"
  }'

# Expected: LLM remembers fever from previous message
# Response should reference the 2-day fever history without user repeating it
```

#### Test 5: Follow-up Questions
```bash
curl -X POST http://localhost:4100/api/v1/ai/chat/public \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I have a cough"
  }'

# Expected:
# - followUpQuestions: [
#     "How long have you had the cough?",
#     "Is it dry or productive (with phlegm)?",
#     "Do you have any other symptoms like fever or shortness of breath?"
#   ]
# - needsFollowUp: true
```

### Running Test Script

```bash
cd services/api
bash test-ai-api.sh
```

---

## 🔍 Troubleshooting

### Issue: "OPENAI_API_KEY is missing"

**Solution:**
1. Check `.env` file has `OPENAI_API_KEY=sk-...`
2. Restart the API server after adding key
3. Verify key is active on https://platform.openai.com

### Issue: Empty responses from AI

**Causes & Solutions:**
- **Rate limited:** OpenAI throttled your requests
  - Wait 60 seconds and retry
  - Check API quota: https://platform.openai.com/account/billing
- **API key quota exceeded:**
  - Add billing to your OpenAI account
  - Check current usage limits
- **Network error:**
  - Check internet connection
  - Verify API endpoint is reachable

### Issue: Wrong language detection

**Debug & Fix:**
```typescript
const { language } = await AIAssistantService.getResponse(message);
console.log('Detected language:', language);
// If wrong, add language hint to message:
const hinted = `[speak-ar] ${message}`;
```

### Issue: "Model not available" error

**Solution:**
- GPT-4.1 requires special access
- Fallback to `gpt-4-turbo-preview` or `gpt-3.5-turbo`
- Update `OPENAI_MODEL` in `.env`:
  ```env
  OPENAI_MODEL=gpt-4-turbo-preview
  ```

### Issue: Database connection fails

**Solution:**
```bash
# Verify PostgreSQL is running
psql -U postgres

# Check connection string
echo $DATABASE_URL

# Run migrations
pnpm run migrate:api

# Check tables exist
psql -c "SELECT * FROM ai_conversations LIMIT 1;"
```

### Issue: Conversation history not loading

**Debug:**
```bash
# Check if messages are being saved
psql -c "SELECT * FROM ai_chat_messages ORDER BY created_at DESC LIMIT 5;"

# Check conversation threads
psql -c "SELECT * FROM ai_conversations ORDER BY created_at DESC LIMIT 5;"

# Verify user_id matches
psql -c "SELECT DISTINCT user_id FROM ai_chat_messages;"
```

---

## 📊 Monitoring & Analytics

### Key Metrics to Track

```typescript
interface AnalyticsEvent {
  userId: string;
  timestamp: Date;
  messageCount: number;
  emergencyDetected: boolean;
  responseTime: number;
  language: Language;
  intent: AssistantIntent;
  hasError: boolean;
}
```

### Dashboard Queries

```sql
-- Most common intents
SELECT intent, COUNT(*) as count 
FROM ai_chat_messages 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY intent
ORDER BY count DESC;

-- Emergency detection rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN is_emergency THEN 1 ELSE 0 END) as emergencies,
  ROUND(100.0 * SUM(CASE WHEN is_emergency THEN 1 ELSE 0 END) / COUNT(*), 2) as emergency_rate
FROM ai_chat_messages
WHERE created_at > NOW() - INTERVAL '7 days';

-- Language distribution
SELECT language, COUNT(*) as count
FROM ai_chat_messages
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY language;
```

---

## 🚀 Deployment Checklist

- [ ] Set `OPENAI_API_KEY` in production environment
- [ ] Verify database migrations ran successfully
- [ ] Test all API endpoints with valid JWT tokens
- [ ] Configure CORS origins for production domain
- [ ] Enable SSL/TLS for API endpoint
- [ ] Set up error logging (Sentry, DataDog, etc.)
- [ ] Monitor API rate limits and costs
- [ ] Test emergency detection with test inputs
- [ ] Validate conversation memory persistence
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Test mobile app integration
- [ ] Test web dashboard integration

---

## 📚 Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/safety-best-practices)
- [PostgreSQL JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)
- [Arabic NLP Resources](https://github.com/topics/arabic-nlp)
- [Medical Terminology Database](https://www.nlm.nih.gov/research/umls/)

---

**Last Updated:** March 25, 2026  
**Maintained By:** Emergency Response System Team  
**Status:** ✅ Production Ready
