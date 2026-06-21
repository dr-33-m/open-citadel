import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: React.ReactNode;
}

export function Touchable({ style, children, ...props }: TouchableProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => {
        const base = typeof style === 'function' ? style({ pressed }) : style;
        return [base, pressed && { opacity: 0.6 }];
      }}
    >
      {children}
    </Pressable>
  );
}
