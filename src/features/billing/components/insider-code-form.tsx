import React from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { ClipboardPaste, Ticket } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Input } from '@/components/ui/input';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type InsiderCodeFormProps = {
  /** The code so far, tidied. What the field starts from when it is rebuilt. */
  code: string;
  /** Changes when the field should start afresh from `code`: on opening, and on a paste. */
  fieldKey: string;
  /** Every character is there, so it is worth asking about. */
  complete: boolean;
  busy: boolean;
  onChange: (text: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
};

/**
 * Where an insider code is typed or pasted.
 *
 * The field, and the button's own spinner while the code is asked about. A
 * code that does not work is said in a toast, by the hook, never in red
 * under the field. A code is twenty characters somebody was sent, so pasting
 * is offered as plainly as typing.
 *
 * The field does not take focus when the sheet opens. The keyboard rises on
 * a tap, and most people arriving here are about to paste.
 */
export function InsiderCodeForm({ code, fieldKey, complete, busy, onChange, onPaste, onSubmit }: InsiderCodeFormProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];

  return (
    <View className="gap-6 px-6 pb-2">
      <View className="gap-2">
        <ThemedText type="labelSm" color={muted}>
          INSIDER CODE
        </ThemedText>
        <ThemedText type="headlineMd">Enter your code</ThemedText>
        <ThemedText type="bodySm" color={muted}>
          It opens a plan for a set time. Nothing is charged.
        </ThemedText>
      </View>
      <Input
        key={fieldKey}
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
        defaultValue={code}
        onChangeText={onChange}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!busy}
        accessibilityLabel="Insider code"
      />
      {/* Paste first and the commit last: most codes arrive by message, so
          pasting is the usual first move, and the gold button is the last
          thing on the sheet, where a commit goes. */}
      <View className="gap-3">
        <ActionButton
          icon={ClipboardPaste}
          label="PASTE"
          tint={tokens['--color-primary']}
          centered
          disabled={busy}
          onPress={onPaste}
          accessibilityLabel="Paste a code from the clipboard"
        />
        <GoldButton label="REDEEM" icon={Ticket} size="compact" onPress={onSubmit} loading={busy} disabled={!complete} />
      </View>
    </View>
  );
}
