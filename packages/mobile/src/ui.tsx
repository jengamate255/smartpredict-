import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const C = {
  bg: '#0f131c', card: '#1c2028', low: '#181c24', high: '#262a33', lowest: '#0a0e16',
  line: '#31353e', text: '#dfe2ee', muted: '#98a99f', green: '#4edea3', greenDark: '#003824',
  pink: '#ffb2b7', red: '#b50036', cyan: '#4cd7f6',
};
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, color = C.muted, size = 20 }: { name: IconName; color?: string; size?: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function T({ children, style, muted, bold, ...props }: TextProps & { muted?: boolean; bold?: boolean }) {
  const resolved = StyleSheet.flatten(style);
  const lineHeight = resolved?.lineHeight ?? Math.ceil((resolved?.fontSize ?? 13) * 1.5);
  return <Text {...props} style={[{ color: muted ? C.muted : C.text, fontSize: 13, lineHeight,
    fontFamily: bold ? 'JakartaBold' : 'Jakarta' }, style]}>{children}</Text>;
}
export function Caps({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return <T bold style={{ color, fontSize: 9, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' }}>{children}</T>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[S.card, style]}>{children}</View>;
}
export function Button({ label, onPress, icon, secondary, disabled, loading, testID }: {
  label: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean; loading?: boolean; testID?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} testID={testID} disabled={disabled || loading}
    onPress={onPress} style={({ pressed }) => [S.button, { backgroundColor: secondary ? C.high : C.green,
      opacity: disabled || loading ? 0.4 : pressed ? 0.7 : 1 }]}>
    {loading ? <ActivityIndicator color={C.greenDark} /> : icon && <Icon name={icon} color={secondary ? C.text : C.greenDark} size={18} />}
    <T bold style={{ color: secondary ? C.text : C.greenDark, textAlign: 'center' }}>{label}</T>
  </Pressable>;
}
export function Empty({ title, detail, retry }: { title: string; detail?: string; retry?: () => void }) {
  return <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 12 }}>
    <Icon name="layers-outline" size={30} color={C.green} />
    <T bold>{title}</T>{detail && <T muted style={{ textAlign: 'center' }}>{detail}</T>}
    {retry && <Button label="Jaribu tena" onPress={retry} secondary />}
  </Card>;
}
export const S = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 12, overflow: 'hidden' },
  button: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 48,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontFamily: 'JakartaExtraBold', fontSize: 24, lineHeight: 32, letterSpacing: -0.7 },
  heading: { fontFamily: 'JakartaBold', fontSize: 18, lineHeight: 26, letterSpacing: -0.4 },
  input: { backgroundColor: C.lowest, color: C.text, fontFamily: 'Jakarta', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 15 },
  content: { padding: 16, paddingBottom: 28, gap: 16 },
  divider: { height: 1, backgroundColor: C.line },
  pill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.high },
});
