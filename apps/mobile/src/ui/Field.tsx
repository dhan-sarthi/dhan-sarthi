// The labelled input.
//
// Cleo floats a small permanent label above the value inside the same white card,
// which is what lets a stack of six of them stay readable without a caption under
// each one. The label never moves, so there is no float animation to get wrong.
import { TextInput, View, type TextInputProps } from 'react-native'
import { Type } from '~/ui/Text'
import { color } from '@dhan/design'

// `className` is deliberately not a prop. Every caller wraps the field in a `View` for its
// layout, and the one class that matters here — the input's own — is written below. A
// `className` prop landed on `rest`, was overridden by that literal, and styled nothing.
export function Field({
  label,
  prefix,
  ...rest
}: TextInputProps & { label: string; prefix?: string }) {
  return (
    <View className="rounded-md border border-hairline bg-surface px-lg py-md">
      <Type role="caption" tone="soft">
        {label}
      </Type>
      <View className="flex-row items-center">
        {prefix ? (
          <Type role="body" tone="mid" className="mr-xs">
            {prefix}
          </Type>
        ) : null}
        <TextInput
          {...rest}
          placeholderTextColor={color.inkFaint}
          className="flex-1 text-body font-normal text-ink"
          style={{ paddingVertical: 2 }}
        />
      </View>
    </View>
  )
}
