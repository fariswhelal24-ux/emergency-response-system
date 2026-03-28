# Arabic AI Medical Assistant System 🏥

منظومة ذكية متكاملة للدعم الطبي بلغة عربية طبيعية مع دعم كامل للهجات العربية والترجمة والتصحيح الإملائي الذكي.

## 🎯 الميزات الرئيسية (تحديث 2025)

### 1. **معالجة النصوص العربية المتقدمة** (`arabic.ts`)
- إزالة التشكيل والحروف الإضافية
- دعم اللهجات العربية المختلفة (مصري، شامي، خليجي)
- تطبيع النصوص
- كشف اللغة (العربية، الإنجليزية، مختلطة)

### 2. **نظام الـ AI الذكي المطور** (`ai-assistant.ts`)
**التحديث الرئيسي:** استبدال النظام القائم على القواعد بنظام AI نقي يعتمد على نماذج اللغة الكبيرة

**الميزات الجديدة:**
- **معالجة مباشرة:** إرسال رسائل المستخدم الخام مباشرة إلى LLM دون تصفية أو تبسيط
- **فهم طبيعي:** فهم اللهجات العربية والإنجليزية بشكل طبيعي، التعامل مع الأخطاء الإملائية والكتابة غير الرسمية
- **ذاكرة محادثة كاملة:** تحسين الردود مع مرور الوقت من خلال السياق التاريخي
- **أسئلة متابعة ذكية:** طرح أسئلة توضيحية مناسبة بشكل طبيعي

**النظام المحسن:**
```typescript
const response = await AIAssistantService.getResponse(
  userMessage, // الرسالة الخام بدون معالجة مسبقة
  { history: conversationHistory }
);
// الـ LLM يعالج كل شيء: الكشف عن الطوارئ، استخراج الكيانات، توليد الردود
```

### 4. **إدارة المحادثات والذاكرة** (`conversation-memory.ts`)
- تخزين المحادثات الطويلة
- استرجاع السياق التاريخي
- البحث في المحادثات
- الإحصائيات والتحليلات

```typescript
import ConversationMemoryService from './conversation-memory';

// حفظ رسالة
await ConversationMemoryService.saveMessage(
  userId,
  "user",
  "عندي أعراض غريبة",
  { language: "ar", intent: "medical_question" }
);

// الحصول على سجل المحادثة
const history = await ConversationMemoryService.getConversationHistory(
  userId,
  20
);

// البحث عن رسائل
const results = await ConversationMemoryService.searchMessages(
  userId,
  "حمى"
);

// إحصائيات المستخدم
const stats = await ConversationMemoryService.getUserStats(userId);
// stats.totalMessages, emergencyCalls, preferredLanguage
```

## 📡 API Endpoints

جميع الـ endpoints تحت `/api/v1/ai`. معظمها يتطلب authentication، مع endpoint عام للموبايل التجريبي.

### POST `/api/v1/ai/chat/public`
إرسال رسالة والحصول على رد ذكي بدون تسجيل دخول (مناسب للـ mobile demo)

**Request:**
```json
{
  "message": "I have fever and cough",
  "history": [
    { "role": "user", "content": "I have fever" },
    { "role": "assistant", "content": "How long have you had it?" }
  ]
}
```

### POST `/api/v1/ai/chat`
إرسال رسالة والحصول على رد ذكي

**Request:**
```json
{
  "message": "عندي حمى عالية",
  "conversationId": "conv_xxx" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userMessage": { ... },
    "assistantMessage": { ... },
    "analysis": {
      "intent": "medical_question",
      "confidence": 0.85,
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

### GET `/api/v1/ai/conversations`
الحصول على جميع المحادثات

### POST `/api/v1/ai/conversations`
إنشاء محادثة جديدة

**Request:**
```json
{
  "title": "استشارة حول الحمى"
}
```

### GET `/api/v1/ai/conversations/:conversationId`
الحصول على رسائل محادثة محددة

### GET `/api/v1/ai/stats`
الحصول على إحصائيات المستخدم

### GET `/api/v1/ai/search?q=حمى`
البحث عن رسائل

## 🗄️ قاعدة البيانات

تم إضافة جداول جديدة:

### `ai_conversations`
```sql
- id: TEXT PRIMARY KEY
- user_id: UUID (FK users)
- title: TEXT
- last_message: TEXT
- message_count: INT
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

### `ai_chat_messages`
```sql
- id: TEXT PRIMARY KEY
- user_id: UUID (FK users)
- conversation_id: TEXT (FK conversations)
- role: TEXT ('user' | 'assistant')
- content: TEXT
- language: TEXT ('ar' | 'en' | 'mixed')
- intent: TEXT
- is_emergency: BOOLEAN
- tokens: INT
- created_at: TIMESTAMPTZ
```

## ⚙️ Configuration

### متطلبات البيئة

أضف إلى ملف `.env`:

```env
OPENAI_API_KEY=sk-... # من https://platform.openai.com
OPENAI_MODEL=gpt-4.1-mini
```

### تثبيت المكتبات

```bash
cd services/api
pnpm install
```

## 🧪 اختبار النظام

### اختبار معالجة النصوص العربية
```bash
# في terminal
node
const { preprocessArabicText } = require('./src/shared/services/arabic');
preprocessArabicText("أناـ عندي حُمّى");
```

### اختبار التصحيح الإملائي
```bash
const { correctText } = require('./src/shared/services/spell-correction');
correctText("حمي عاليه");
```

### اختبار الـ API
```bash
# Chat مع الـ AI
curl -X POST http://localhost:4100/api/v1/ai/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "عندي حمى"}'

# الحصول على المحادثات
curl http://localhost:4100/api/v1/ai/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🚀 الاستخدام من الـ Mobile App

### تكامل في `MedicalChatScreen.tsx`

```typescript
import axios from 'axios';

// إرسال رسالة والحصول على رد
const response = await axios.post(
  'http://api-server/api/v1/ai/chat',
  {
    message: userInput,
    conversationId: currentConversationId
  },
  {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  }
);

const { response: assistantMessage, analysis } = response.data.data;

// إذا كانت حالة طوارئ، اعرض تنبيه
if (analysis.isEmergency) {
  Alert.alert('⚠️ حالة طوارئ!', 'يرجى الاتصال برقم الطوارئ فوراً');
}
```

### عرض معلومات التحليل
```typescript
console.log(`Language: ${analysis.language}`);
console.log(`Intent: ${analysis.intent}`);
console.log(`Symptoms: ${analysis.entities.symptoms.join(', ')}`);
```

## 🔐 الأمان والخصوصية

- جميع الرسائل مشفرة في قاعدة البيانات
- لا يتم مشاركة البيانات مع OpenAI مباشرة
- كل مستخدم يرى فقط محادثاته الخاصة
- تتم إزالة الرسائل القديمة (> 90 يوم) تلقائياً

## 📊 الإحصائيات المتاحة

```typescript
const stats = await ConversationMemoryService.getUserStats(userId);

// {
//   totalMessages: 42,
//   emergencyCalls: 2,
//   preferredLanguage: 'ar',
//   lastActive: Date
// }
```

## 🐛 معالجة الأخطاء

جميع العمليات محمية بـ try-catch:

```typescript
try {
  const response = await AIAssistantService.getResponse(userMessage);
} catch (error) {
  console.error('AI Service Error:', error);
  // Return fallback response
}
```

## 🎓 أمثلة متقدمة

### تصحيح والترجمة المتسلسلة
```typescript
import { correctArabicSpelling, normalizeDialect } from './arabic';
import { correctText } from './spell-correction';
import AIAssistantService from './ai-assistant';

// 1. تصحيح الإملاء
let text = "أناـ عندى حمي عالية";
text = correctArabicSpelling(text);

// 2. تطبيع اللهجات
text = normalizeDialect(text);

// 3. تصحيح النص
const { corrected } = correctText(text);

// 4. الحصول على رد ذكي
const response = await AIAssistantService.getResponse(corrected);
```

### بناء نظام توصيات
```typescript
const { intent, keywords } = AIAssistantService.detectIntent(message);
const entities = AIAssistantService.extractMedicalEntities(message);

// استخدم المعلومات لإنشاء سياق شخصي
const personalizedContext = {
  symptoms: entities.symptoms,
  history: await ConversationMemoryService.getConversationHistory(userId, 5)
};

// احصل على رد مخصص
const response = await AIAssistantService.getResponse(message, {
  userId,
  history: personalizedContext.history
});
```

## 📝 Todo المستقبل

- [ ] دعم نماذج محلية (Llama 2 محسَّن للعربية)
- [ ] تكامل مع ويكيبيديا الطبية العربية
- [ ] نظام تقييم الإجابات من المستخدمين
- [ ] تحسين كشف الطوارئ الطبية
- [ ] دعم الصور الطبية وتحليلها
- [ ] نظام توصيات طبية مخصص

## 📞 الدعم الفني

في حالة وجود مسائل:

1. تحقق من الـ OpenAI API Key
2. تأكد من الاتصال بقاعدة البيانات
3. تحقق من سجلات الأخطاء في الـ server

---

بُني بـ ❤️ للرعاية الصحية الذكية والمتاحة للجميع بالعربية
