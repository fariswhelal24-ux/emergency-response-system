import { I18nManager, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors, radius, spacing } from "../theme/tokens";

const isRTL = I18nManager.isRTL;

type InputFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string;
  optional?: boolean;
} & TextInputProps;

export const InputField = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  optional,
  ...rest
}: InputFieldProps) => (
  <View style={styles.fieldWrap}>
    <Text style={[styles.label, styles.textStart]}>
      {label}
      {optional ? <Text style={styles.optional}> (Optional)</Text> : null}
    </Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.inkMuted}
      style={[
        styles.input,
        styles.textStart,
        error ? styles.inputError : undefined,
        rest.multiline ? styles.inputMultiline : undefined
      ]}
      {...rest}
    />
    {error ? <Text style={[styles.errorText, styles.textStart]}>{error}</Text> : null}
  </View>
);

export const ChoiceChips = <T extends string,>({
  options,
  value,
  onChange
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) => (
  <View style={styles.chipWrap}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <Pressable
          key={option.value}
          style={[styles.chip, active ? styles.chipActive : undefined]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.chipText, active ? styles.chipTextActive : undefined]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export const SectionCaption = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <View style={styles.sectionWrap}>
    <Text style={[styles.sectionTitle, styles.textStart]}>{title}</Text>
    {subtitle ? <Text style={[styles.sectionSubtitle, styles.textStart]}>{subtitle}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  fieldWrap: {
    gap: 6
  },
  label: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 13
  },
  textStart: {
    textAlign: isRTL ? "right" : "left"
  },
  optional: {
    color: colors.inkMuted,
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: "top"
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: "#FFF5F5"
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600"
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.surfaceSoft
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  chipText: {
    color: colors.inkMuted,
    fontWeight: "700",
    fontSize: 12
  },
  chipTextActive: {
    color: colors.primary
  },
  sectionWrap: {
    gap: 4,
    marginBottom: spacing.sm
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  sectionSubtitle: {
    color: colors.inkMuted,
    lineHeight: 20
  }
});
