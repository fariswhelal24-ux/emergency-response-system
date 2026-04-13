import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { sendMedicalChatMessage } from "../services/api";
import { radius, spacing } from "../theme/tokens";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const detectLanguage = (text: string): "ar" | "en" => (/[^\x00-\x7F]/.test(text) ? "ar" : "en");

const hasEmergencySignals = (text: string): boolean =>
  /not breathing|unconscious|not responsive|severe chest pain|stroke|seizure|severe bleeding|overdose|poison|suicid|لا يتنفس|فاقد الوعي|لا يستجيب|ألم صدر شديد|جلطة|نزيف شديد|تسمم|انتحار/i.test(
    text
  );

const buildChatFallbackText = (text: string): string => {
  const isArabic = detectLanguage(text) === "ar";
  const isEmergency = hasEmergencySignals(text);

  if (isArabic) {
    return isEmergency
      ? "هذه حالة طارئة محتملة. اتصل بالإسعاف فوراً الآن، وإذا كان المصاب لا يتنفس ابدأ الإنعاش القلبي الرئوي."
      : "سأبقى معك بخطوات إسعاف أولي آمنة. اذكر الأعراض ومدة بدايتها وشدتها من 1 إلى 10.";
  }

  return isEmergency
    ? "This may be a life-threatening emergency. Call emergency services now and start CPR if the person is not breathing."
    : "I can guide you with safe first-aid steps. Please share symptom duration and severity from 1 to 10.";
};

const initialMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    text: "Hello. Tell me briefly what symptoms or first-aid question you have. مرحباً، اكتب باختصار الأعراض أو سؤال الإسعاف الأولي الذي لديك."
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

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: value
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
      const fallbackAssistantMessage: ChatMessage = {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        text: buildChatFallbackText(value)
      };

      setMessages((current) => [...current, fallbackAssistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.bgGradient} />
        <Text style={styles.ambulanceTop}>AI</Text>
        <View style={styles.decorCrossOne}>
          <Text style={styles.crossText}>+</Text>
        </View>
        <View style={styles.decorCrossTwo}>
          <Text style={styles.crossText}>+</Text>
        </View>

        <View style={styles.header}>
          <Pressable onPress={onBackToAlerts} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>Medical Chat</Text>
            <Text style={styles.subtitle}>Ask health questions</Text>
          </View>
        </View>

        <ScrollView style={styles.chatContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.emergencyAlert}>
            <Text style={styles.emergencyIcon}>!</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Need Emergency Help?</Text>
              <Text style={styles.alertText}>For life-threatening situations, use Emergency Request immediately.</Text>
            </View>
            <Pressable onPress={onBackToAlerts} style={styles.alertButton}>
              <Text style={styles.alertButtonText}>Go</Text>
            </Pressable>
          </View>

          <View style={styles.messagesContent}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.messageRow, message.role === "user" ? styles.userRow : styles.assistantRow]}
              >
                {message.role === "assistant" ? (
                  <View style={styles.assistantBadge}>
                    <Text style={styles.assistantBadgeText}>AI</Text>
                  </View>
                ) : null}

                <View style={[styles.bubble, message.role === "user" ? styles.userBubble : styles.assistantBubble]}>
                  <Text style={message.role === "user" ? styles.userText : styles.assistantText}>{message.text}</Text>
                </View>
              </View>
            ))}

            {isTyping ? (
              <View style={[styles.messageRow, styles.assistantRow]}>
                <View style={styles.assistantBadge}>
                  <Text style={styles.assistantBadgeText}>AI</Text>
                </View>
                <View style={styles.assistantBubble}>
                  <Text style={styles.assistantText}>Thinking...</Text>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="Ask a health question..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => {
              if (canSend) {
                void sendMessage(input);
              }
            }}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={() => {
              if (canSend) {
                void sendMessage(input);
              }
            }}
            disabled={!canSend}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>

        <Pressable onPress={onBackToAlerts} style={styles.backButtonBottom}>
          <Text style={styles.backButtonText}>Back to Home</Text>
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1
  },
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    overflow: "hidden"
  },
  bgGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#F5F9FF",
    opacity: 0.92
  },
  ambulanceTop: {
    position: "absolute",
    top: 100,
    left: 30,
    fontSize: 44,
    fontWeight: "900",
    color: "#1E63FF",
    opacity: 0.08,
    zIndex: 0
  },
  crossText: {
    color: "#1E63FF",
    fontSize: 52,
    fontWeight: "200",
    opacity: 0.2
  },
  decorCrossOne: {
    position: "absolute",
    top: 200,
    right: 30,
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1
  },
  decorCrossTwo: {
    position: "absolute",
    bottom: 300,
    left: 25,
    width: 75,
    height: 75,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E2EAF6",
    backgroundColor: "#FFFFFF",
    zIndex: 10
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md
  },
  backIcon: {
    fontSize: 30,
    color: "#21364F",
    marginTop: -2
  },
  headerTitle: {
    flex: 1
  },
  title: {
    color: "#21364F",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.3
  },
  subtitle: {
    color: "#5B6D86",
    fontSize: 13,
    marginTop: 2
  },
  chatContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    zIndex: 10
  },
  emergencyAlert: {
    flexDirection: "row",
    backgroundColor: "#EAF2FF",
    borderWidth: 2,
    borderColor: "#B5CDFF",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.sm
  },
  emergencyIcon: {
    fontSize: 18,
    color: "#1E63FF",
    marginTop: 2,
    fontWeight: "900"
  },
  alertContent: {
    flex: 1
  },
  alertTitle: {
    color: "#1E63FF",
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 2
  },
  alertText: {
    color: "#5B6E84",
    fontSize: 13,
    lineHeight: 18
  },
  alertButton: {
    backgroundColor: "#1E63FF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    justifyContent: "center"
  },
  alertButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13
  },
  messagesContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg
  },
  messageRow: {
    width: "100%",
    marginBottom: spacing.sm,
    flexDirection: "row"
  },
  assistantRow: {
    justifyContent: "flex-start"
  },
  userRow: {
    justifyContent: "flex-end"
  },
  assistantBadge: {
    marginRight: spacing.sm,
    marginTop: 2,
    width: 22,
    height: 22,
    borderRadius: radius.round,
    backgroundColor: "#DDE8FF",
    alignItems: "center",
    justifyContent: "center"
  },
  assistantBadgeText: {
    color: "#2157B2",
    fontSize: 10,
    fontWeight: "800"
  },
  bubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "85%"
  },
  assistantBubble: {
    backgroundColor: "#F1F5FC",
    borderWidth: 1,
    borderColor: "#DEE7F5"
  },
  userBubble: {
    backgroundColor: "#1E63FF"
  },
  assistantText: {
    color: "#2A3C52",
    lineHeight: 20,
    fontSize: 14
  },
  userText: {
    color: "#FFFFFF",
    lineHeight: 20,
    fontSize: 14
  },
  inputArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2EAF6",
    zIndex: 10
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DEE7F5",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#F8FAFF",
    color: "#2A3C52",
    minHeight: 44,
    maxHeight: 100,
    textAlignVertical: "center",
    fontSize: 14,
    textAlign: "left"
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "#1E63FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  },
  sendIcon: {
    color: "#FFFFFF",
    fontSize: 20,
    marginLeft: 2
  },
  sendButtonDisabled: {
    backgroundColor: "#CCCCCC",
    opacity: 0.5
  },
  backButtonBottom: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: "#B5CDFF",
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    zIndex: 10
  },
  backButtonText: {
    color: "#1E63FF",
    fontWeight: "700",
    fontSize: 15
  }
});
