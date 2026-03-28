import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Card, GhostButton, PrimaryButton, ScreenShell, SectionTitle } from "../components/Ui";
import { sendMedicalChatMessage } from "../services/api";
import { colors, radius, spacing } from "../theme/tokens";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const quickPrompts = [
  "What advice should I give for mild flu symptoms?",
  "How to explain safe hydration to a patient?",
  "What are non-emergency asthma caution signs?",
  "How to counsel for minor wound care?"
];

const detectLanguage = (text: string): "ar" | "en" => (/[\u0600-\u06FF]/.test(text) ? "ar" : "en");
const hasEmergencySignals = (text: string): boolean =>
  /not breathing|unconscious|not responsive|severe chest pain|stroke|seizure|severe bleeding|overdose|poison|suicid|لا يتنفس|فاقد الوعي|لا يستجيب|ألم صدر شديد|جلطة|نزيف شديد|تسمم|انتحار/i.test(
    text
  );

const buildChatFallbackText = (text: string): string => {
  const isArabic = detectLanguage(text) === "ar";
  const isEmergency = hasEmergencySignals(text);

  if (isArabic) {
    return isEmergency
      ? "هذه حالة طارئة محتملة. اتصل بالإسعاف فوراً الآن واتبع بروتوكول الطوارئ."
      : "أستطيع تقديم إرشادات أولية عامة. أرسل تفاصيل الأعراض والشدة والمدة.";
  }

  return isEmergency
    ? "This may be an emergency. Call emergency services immediately and follow emergency protocol."
    : "I can provide general first-aid guidance. Share symptom details, severity, and duration.";
};

const initialMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    text: "Medical assistant is ready. Ask a first-aid or symptom question and I will answer directly."
  }
];

export const MedicalChatScreen = ({
  onBackToAlerts
}: {
  onBackToAlerts: () => void;
}) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const sendMessage = async (value: string) => {
    if (!value.trim()) {
      return;
    }
    const text = value;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsTyping(true);

    const messagesForApi = [...messages, userMessage]
      .map((message) => ({
        role: message.role,
        content: message.text
      }))
      .slice(-40);

    try {
      const result = await sendMedicalChatMessage(messagesForApi);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        text:
          result.message.trim() ||
          (result.analysis.responseLanguage === "ar"
            ? "لم أستلم رداً واضحاً من المساعد. يرجى المحاولة مرة أخرى."
            : "I did not receive a clear assistant reply. Please try again.")
      };

      setMessages((current) => [...current, assistantMessage]);

      if (result.analysis.isEmergency) {
        Alert.alert(
          "Emergency warning",
          "This may be urgent. Use Emergency Request now or call local emergency services."
        );
      }
    } catch {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        text: buildChatFallbackText(text)
      };

      setMessages((current) => [...current, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <ScreenShell>
      <Card>
        <SectionTitle title="Medical Guidance Chat" subtitle="Non-Emergency Medical Assistant" />

        <Card style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>Important Disclaimer</Text>
          <Text style={styles.disclaimerText}>
            This chat is for non-emergency medical guidance only. For urgent incidents, use emergency response flow
            and dispatch actions immediately.
          </Text>
        </Card>

        <Card style={styles.operationalCard}>
          <Text style={styles.operationalTitle}>Volunteer Operations Remain Priority</Text>
          <Text style={styles.operationalText}>
            Alerts, navigation, and live case coordination are separate from this chat and should be used for real
            incidents.
          </Text>
          <PrimaryButton label="Back To Incident Alerts" onPress={onBackToAlerts} />
        </Card>

        <View style={styles.quickPromptWrap}>
          {quickPrompts.map((prompt) => (
            <Pressable key={prompt} style={styles.quickPrompt} onPress={() => void sendMessage(prompt)}>
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>

        <Card style={styles.chatCard}>
          {messages.map((message) => (
            <View
              key={message.id}
              style={[styles.messageRow, message.role === "user" ? styles.userRow : styles.assistantRow]}
            >
              <View
                style={[
                  styles.bubble,
                  message.role === "user" ? styles.userBubble : styles.assistantBubble
                ]}
              >
                <Text style={message.role === "user" ? styles.userText : styles.assistantText}>{message.text}</Text>
              </View>
            </View>
          ))}
          {isTyping ? (
            <View style={[styles.messageRow, styles.assistantRow]}>
              <View style={[styles.bubble, styles.assistantBubble]}>
                <Text style={styles.assistantText}>Thinking...</Text>
              </View>
            </View>
          ) : null}
        </Card>

        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask a non-emergency medical question"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
          multiline
        />

        <PrimaryButton
          label="Send"
          onPress={() => {
            if (canSend) {
              void sendMessage(input);
            }
          }}
        />
        <GhostButton label="Back to Alerts" onPress={onBackToAlerts} />
      </Card>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  disclaimerCard: {
    backgroundColor: "#FFF5F5",
    borderColor: "#EDCBCF"
  },
  disclaimerTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4
  },
  disclaimerText: {
    color: colors.ink,
    lineHeight: 20
  },
  operationalCard: {
    backgroundColor: "#EDF6F1"
  },
  operationalTitle: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800"
  },
  operationalText: {
    color: colors.inkMuted,
    marginTop: 4,
    marginBottom: spacing.md,
    lineHeight: 20
  },
  quickPromptWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  quickPrompt: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    backgroundColor: "#EAF4EF",
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  quickPromptText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12
  },
  chatCard: {
    gap: spacing.sm,
    backgroundColor: "#F8FBF9"
  },
  messageRow: {
    width: "100%"
  },
  assistantRow: {
    alignItems: "flex-start"
  },
  userRow: {
    alignItems: "flex-end"
  },
  bubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "92%"
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  userBubble: {
    backgroundColor: colors.primary
  },
  assistantText: {
    color: colors.ink,
    lineHeight: 20
  },
  userText: {
    color: "#FFFFFF",
    lineHeight: 20
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSoft,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: "top"
  }
});
