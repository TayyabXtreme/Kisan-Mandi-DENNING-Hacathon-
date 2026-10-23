import { useState, type ReactNode, type Ref } from "react";
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";

/**
 * White rounded input from the references: green border while focused, red
 * on error, optional prefix ("+92", "Rs") with a divider, and helper text.
 */
export function TextField({
  prefix,
  error,
  hint,
  ref,
  containerStyle,
  bold,
  valid,
  left,
  right,
  ...props
}: TextInputProps & {
  /** Icon before the text (e.g. a mail glyph). */
  left?: ReactNode;
  /** Element after the text (e.g. a show-password toggle). */
  right?: ReactNode;
  /** Green border when the value is valid (e.g. a price at market). */
  valid?: boolean;
  prefix?: string;
  /** Red border + message (pass true for border only). */
  error?: string | boolean;
  /** Grey helper line under the field (hidden while there's an error). */
  hint?: string;
  ref?: Ref<TextInput>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Bold value, e.g. prices. */
  bold?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={containerStyle}>
      <View style={[styles.input, (focused || valid) && styles.focused, !!error && styles.error]}>
        {left && <View style={styles.left}>{left}</View>}
        {!!prefix && (
          <>
            <Text style={[styles.prefix, prefix === "Rs" && styles.prefixMuted]}>{prefix}</Text>
            {prefix !== "Rs" && <View style={styles.divider} />}
          </>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.muted}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.text, bold && { fontFamily: fonts.bold }, prefix === "Rs" && { marginLeft: 8 }]}
        />
        {right}
      </View>
      {typeof error === "string" && !!error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1.2,
    borderColor: theme.card,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  focused: { borderColor: theme.green },
  error: { borderColor: theme.red },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: theme.ink, paddingVertical: 14 },
  prefix: { fontFamily: fonts.semibold, fontSize: 16, color: theme.ink },
  prefixMuted: { fontFamily: fonts.regular, color: theme.muted },
  left: { marginRight: 12 },
  divider: { width: 1, height: 22, backgroundColor: theme.line, marginHorizontal: 12 },
  errorText: { marginTop: 6, fontFamily: fonts.medium, fontSize: 12.5, color: theme.red },
  hint: { marginTop: 6, fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
});
