import React from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer } from 'react-native-marked';

const LIST_ROW: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start' };

/** Wide enough for "10." before it wraps; right-aligned so the dots line up. */
const LIST_MARKER: TextStyle = { minWidth: 22, paddingRight: 8, textAlign: 'right' };

/**
 * The item's content beside its marker.
 *
 * `flexShrink`, and deliberately NOT `flex: 1`. That shorthand also sets
 * `flexBasis: 0`, which tells Yoga the child has no intrinsic width — and a
 * bubble that sizes to its content then has nothing to size to. It collapsed
 * to roughly its longest word and wrapped mid-word: "Biograph / ies of the /
 * greats" in a bubble a third of the screen wide, while the plain-text bubble
 * above it filled the row.
 *
 * With `flexShrink` alone the basis stays `auto`, so the row reports its real
 * width while measuring and still gives way when the bubble's max-width bites.
 */
const LIST_CONTENT: ViewStyle = { flexShrink: 1 };

/**
 * `react-native-marked`'s renderer with lists drawn here instead.
 *
 * The library renders them through `@jsamr/react-native-li`, and on these
 * screens that path left a large block of empty space below the last line of
 * any message containing a list — measured at 405px on a four-item list,
 * against 34px (the correct margin) once the same text was rendered as plain
 * paragraphs. The space is trailing rather than between items, so it read as
 * the bubble having a huge bottom margin. Nothing in our own styles caused it:
 * stripping every custom style left the gap in place and made it larger.
 *
 * Overriding `list` is the narrow fix — a marker and the item content in a
 * row, which is all the library's version does visually — and it takes the
 * dependency out of the layout entirely. Everything else still renders through
 * the stock `Renderer`.
 *
 * Shared, because both places Samwell speaks render markdown: the chat bubble
 * and Compass. Compass was still on the stock renderer and had both bugs.
 */
export class MarkdownListRenderer extends Renderer {
  list(
    ordered: boolean,
    li: React.ReactNode[],
    listStyle?: ViewStyle,
    textStyle?: TextStyle,
    startIndex = 1,
  ): React.ReactNode {
    return (
      <View key={this.getKey()} style={listStyle}>
        {li.map((item, i) => (
          // Index keys: the item nodes are already built and this list is
          // rebuilt wholesale whenever the markdown changes.
          <View key={i} style={LIST_ROW}>
            <Text style={[textStyle, LIST_MARKER]}>
              {ordered ? `${startIndex + i}.` : '•'}
            </Text>
            <View style={LIST_CONTENT}>{item}</View>
          </View>
        ))}
      </View>
    );
  }
}
