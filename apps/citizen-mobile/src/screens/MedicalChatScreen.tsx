import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Haptics from "expo-haptics";

import { sendMedicalChatMessage } from "../services/api";
import { radius, spacing } from "../theme/tokens";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  isTyping?: boolean;
};

const detectLanguage = (text: string): "ar" | "en" => {
  const arabicChars = /[\u0600-\u06FF]/;
  return arabicChars.test(text) ? "ar" : "en";
};

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

const translationDict: Record<string, string> = {
  "حمى": "fever",
  "صداع": "headache",
  "سعال": "cough",
  "ألم": "pain",
  "غثيان": "nausea",
  "قيء": "vomit",
  "حساسية": "allergy",
  "إسهال": "diarrhea",
  "برد": "cold",
  "إنفلونزا": "flu",
  "ضغط": "pressure",
  "سكري": "diabetes",
  fever: "حمى",
  headache: "صداع",
  cough: "سعال",
  pain: "ألم",
  nausea: "غثيان",
  vomit: "قيء",
  allergy: "حساسية",
  diarrhea: "إسهال",
  cold: "برد",
  flu: "إنفلونزا"
};

const translateText = (text: string, targetLang?: "ar" | "en"): string => {
  const sourceLang = detectLanguage(text);
  const target = targetLang || (sourceLang === "ar" ? "en" : "ar");

  if (sourceLang === target) {
    return text;
  }

  const words = text.split(" ");
  const translated = words.map((word) => {
    const cleaned = word.toLowerCase().replace(/[^\u0600-\u06FF\w]/g, "");

    if (target === "ar") {
      return translationDict[cleaned] || word;
    }

    if (target === "en") {
      const reverseKey = Object.entries(translationDict).find(([, ar]) => ar === cleaned);
      return reverseKey ? reverseKey[0] : word;
    }

    return word;
  });

  return translated.join(" ");
};

const selectTranslationLanguage = (
  messageText: string,
  onTranslate: (lang: "ar" | "en", translated: string) => void
) => {
  const languageOptions = ["Cancel", "Arabic", "English"];
  const targetLanguage = (index: number) => {
    if (index === 1) {
      return "ar" as const;
    }

    if (index === 2) {
      return "en" as const;
    }

    return undefined;
  };

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: languageOptions,
        cancelButtonIndex: 0,
        userInterfaceStyle: "dark"
      },
      (buttonIndex) => {
        const lang = targetLanguage(buttonIndex);
        if (!lang) {
          return;
        }

        const translated = translateText(messageText, lang);
        onTranslate(lang, translated);
      }
    );
  } else {
    Alert.alert("Translate to", "Select translation language:", [
      {
        text: "Arabic",
        onPress: () => {
          const translated = translateText(messageText, "ar");
          onTranslate("ar", translated);
        }
      },
      {
        text: "English",
        onPress: () => {
          const translated = translateText(messageText, "en");
          onTranslate("en", translated);
        }
      },
      { text: "Cancel", style: "cancel" }
    ]);
  }
};

const initialMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    text: "Hello. Tell me briefly what symptoms or first-aid question you have. مرحباً، اكتب باختصار الأعراض أو سؤال الإسعاف الأولي الذي لديك."
  }
];

export const MedicalChatScreen = ({
  onBack,
  onUseEmergency
}: {
  onBack: () => void;
  onUseEmergency: () => void;
}) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [translationModalVisible, setTranslationModalVisible] = useState(false);
  const [translationResult, setTranslationResult] = useState("");
  const [translationTo, setTranslationTo] = useState<"ar" | "en" | null>(null);

  const canSend = useMemo(() => input.trim().length > 0, [input]);

  const selectTranslationLanguageHandler = (messageText: string) => {
    selectTranslationLanguage(messageText, (lang, translated) => {
      setTranslationTo(lang);
      setTranslationResult(translated);
      setTranslationModalVisible(true);
    });
  };

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
            : "I did not receive a clear assistant reply. Please try again."),
        isTyping: false
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
        text: buildChatFallbackText(text),
        isTyping: false
      };

      setMessages((current) => [...current, fallbackAssistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleLongPress = (messageText: string, messageRole: string) => {
    Haptics.selectionAsync();

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Copy", "Share", "Translate"],
          cancelButtonIndex: 0,
          userInterfaceStyle: "dark"
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            return;
          }

          if (buttonIndex === 1) {
            Clipboard.setString(messageText);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("", "Copied to clipboard", [{ text: "OK" }], {
              userInterfaceStyle: "dark"
            });
            return;
          }

          if (buttonIndex === 2) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Share.share({
              message: messageText,
              title: messageRole === "assistant" ? "Medical Advice" : "My Message"
            });
            return;
          }

          if (buttonIndex === 3) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            selectTranslationLanguageHandler(messageText);
          }
        }
      );
      return;
    }

    Alert.alert("Message Options", "Choose an action:", [
      {
        text: "Copy",
        onPress: () => {
          Clipboard.setString(messageText);
          Alert.alert("Copied", "Message copied to clipboard");
        }
      },
      {
        text: "Share",
        onPress: () => {
          Share.share({
            message: messageText,
            title: messageRole === "assistant" ? "Medical Advice" : "My Message"
          });
        }
      },
      {
        text: "Translate",
        onPress: () => {
          selectTranslationLanguageHandler(messageText);
        }
      },
      {
        text: "Cancel",
        style: "cancel"
      }
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <SafeAreaView style={styles.root}>
        <Modal
          animationType="fade"
          transparent
          visible={translationModalVisible}
          onRequestClose={() => setTranslationModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Translation {translationTo === "ar" ? "(Arabic)" : "(English)"}</Text>
              <Text style={styles.modalText}>{translationResult || "No translation available."}</Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalButton}
                  onPress={() => {
                    Clipboard.setString(translationResult);
                    setTranslationModalVisible(false);
                    Alert.alert("Copied", "Translated text copied to clipboard.");
                  }}
                >
                  <Text style={styles.modalButtonText}>Copy</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalCancel]}
                  onPress={() => setTranslationModalVisible(false)}
                >
                  <Text style={[styles.modalButtonText, styles.modalCancelText]}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.bgGradient} />
        <Text style={styles.ambulanceTop}>🚨</Text>
        <View style={styles.decorCrossOne}>
          <Text style={styles.crossText}>+</Text>
        </View>
        <View style={styles.decorCrossTwo}>
          <Text style={styles.crossText}>+</Text>
        </View>

        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>Medical Chat</Text>
            <Text style={styles.subtitle}>Ask health questions</Text>
          </View>
        </View>

        <ScrollView style={styles.chatContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.emergencyAlert}>
            <Text style={styles.emergencyIcon}>⚠️</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Need Emergency Help?</Text>
              <Text style={styles.alertText}>For life-threatening situations, use Emergency Request immediately.</Text>
            </View>
            <Pressable onPress={onUseEmergency} style={styles.alertButton}>
              <Text style={styles.alertButtonText}>Go</Text>
            </Pressable>
          </View>

          <View style={styles.messagesContent}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.messageRow, message.role === "user" ? styles.userRow : styles.assistantRow]}
              >
                {message.role === "assistant" && <Text style={styles.assistantIcon}>🤖</Text>}
                <Pressable
                  onLongPress={() => handleLongPress(message.text, message.role)}
                  delayLongPress={500}
                  style={[styles.bubble, message.role === "user" ? styles.userBubble : styles.assistantBubble]}
                >
                  <Text
                    style={message.role === "user" ? styles.userText : styles.assistantText}
                    selectable={false}
                    selectionColor="transparent"
                  >
                    {message.text}
                  </Text>
                  {message.isTyping && (
                    <View style={styles.typingIndicator}>
                      <View style={styles.typingDot} />
                      <View style={[styles.typingDot, styles.typingDotDelay]} />
                      <View style={[styles.typingDot, styles.typingDotDelay2]} />
                    </View>
                  )}
                </Pressable>
              </View>
            ))}

            {isTyping && (
              <View style={[styles.messageRow, styles.assistantRow]}>
                <Text style={styles.assistantIcon}>🤖</Text>
                <View style={styles.assistantBubble}>
                  <View style={styles.typingIndicator}>
                    <View style={styles.typingDot} />
                    <View style={[styles.typingDot, styles.typingDotDelay]} />
                    <View style={[styles.typingDot, styles.typingDotDelay2]} />
                  </View>
                </View>
              </View>
            )}
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
            spellCheck={true}
            textContentType="none"
            keyboardType="default"
            returnKeyType="send"
            selectionColor="transparent"
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

        <Pressable onPress={onBack} style={styles.backButtonBottom}>
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
    backgroundColor: "#F8FAFB",
    opacity: 0.85
  },
  ambulanceTop: {
    position: "absolute",
    top: 100,
    left: 30,
    fontSize: 48,
    opacity: 0.07,
    zIndex: 0
  },
  crossText: {
    color: "#D90C1E",
    fontSize: 52,
    fontWeight: "200",
    opacity: 0.22
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
    borderBottomColor: "#E6E8EB",
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
    color: "#2D3748",
    marginTop: -2
  },
  headerTitle: {
    flex: 1
  },
  title: {
    color: "#2D3748",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.3
  },
  subtitle: {
    color: "#5C6878",
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
    backgroundColor: "#FDE5E7",
    borderWidth: 2,
    borderColor: "#F5A8AF",
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: "flex-start",
    gap: spacing.sm
  },
  emergencyIcon: {
    fontSize: 18
  },
  alertContent: {
    flex: 1
  },
  alertTitle: {
    color: "#D90C1E",
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
    backgroundColor: "#D90C1E",
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
  assistantIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
    fontSize: 18
  },
  bubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "85%"
  },
  assistantBubble: {
    backgroundColor: "#F0F3F9",
    borderWidth: 1,
    borderColor: "#E0E4ED"
  },
  userBubble: {
    backgroundColor: "#D90C1E"
  },
  assistantText: {
    color: "#2D3748",
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
    borderTopColor: "#E6E8EB",
    zIndex: 10
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E0E4ED",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#F8FAFB",
    color: "#2D3748",
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
    backgroundColor: "#D90C1E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#D90C1E",
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
    borderColor: "#F5A8AF",
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    zIndex: 10
  },
  backButtonText: {
    color: "#D90C1E",
    fontWeight: "700",
    fontSize: 15
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: spacing.sm
  },
  modalText: {
    fontSize: 14,
    color: "#334155",
    marginBottom: spacing.md
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  modalButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: "#D90C1E",
    borderRadius: radius.md
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "700"
  },
  modalCancel: {
    backgroundColor: "#E2E8F0"
  },
  modalCancelText: {
    color: "#334155"
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    gap: 4
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D90C1E",
    opacity: 0.6
  },
  typingDotDelay: {
    opacity: 0.45
  },
  typingDotDelay2: {
    opacity: 0.3
  }
});
