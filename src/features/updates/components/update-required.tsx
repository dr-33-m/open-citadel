import React from 'react';
import { Modal, View } from 'react-native';

import { Download, RotateCw } from '@/components/icons';
import { OnboardingStage } from '@/components/stage/onboarding-stage';
import { StageGlyph } from '@/components/stage/stage-glyph';
import { StageHeading } from '@/components/stage/stage-heading';
import { GoldButton } from '@/components/ui/gold-button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

import { gateCopy, type GateVerdict } from '../utils/update-gate';

type UpdateRequiredProps = {
  update: GateVerdict | null;
  working: boolean;
  onUpdate: () => void;
  bottomPadding: number;
};

/** Back does nothing: there is nowhere behind this screen to go. */
const STAY = () => undefined;

/**
 * The screen a copy of the app the server no longer serves opens onto: what
 * happened in one line, and the one way forward.
 *
 * A `Modal`, so it draws over every sheet and screen, and holds the Android
 * back button.
 */
export function UpdateRequired({ update, working, onUpdate, bottomPadding }: UpdateRequiredProps) {
  const tokens = useThemeTokens();
  if (!update) return null;
  const copy = gateCopy(update);
  const icon = update === 'restart' ? RotateCw : Download;

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={STAY}>
      <View className="flex-1 bg-background">
        <OnboardingStage
          bottomPadding={bottomPadding}
          footer={<GoldButton label={copy.action} icon={icon} onPress={onUpdate} loading={working} />}
        >
          <StageGlyph icon={icon} color={tokens['--color-primary']} />
          <StageHeading title={copy.title} subtitle={copy.line} />
        </OnboardingStage>
      </View>
    </Modal>
  );
}
