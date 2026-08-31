/**
 * DatePicker — a calendar behind a button.
 *
 * ```tsx
 * const [day, setDay] = useState<Date>();
 *
 * <DatePicker selected={day} onSelect={setDay} placeholder="Pick a date" />
 * ```
 *
 * It is the `Calendar` in a `Popover` with a trigger that reads back what was
 * chosen, and it is a separate component from the calendar for the same reason
 * `Select` is separate from a list: the hard parts are the ones around the
 * grid — what a closed field says, when the panel closes, and what a range
 * shows while only half of it has been picked.
 *
 * ## It closes when the selection is finished, not when it changes
 *
 * A single date is done in one tap, so the panel closes on it. A range needs
 * two, so it stays open until the second — closing on the first would put
 * someone back where they started with half a range on screen. Multiple never
 * closes on its own; only the caller knows when a set is complete.
 *
 * ## An anchored panel, not a sheet
 *
 * A month grid is a fixed size that fits beside its trigger on any phone, and
 * a sheet is the right container for a list of unknown length rather than for
 * a shape that is always the same. Pass `presentation="bottom-sheet"` where the
 * screen is busy — a form with the keyboard up is the usual case.
 */
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { CalendarIcon } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { calendarShortDate, resolveCalendar, type CalendarSystem } from '@/lib/date';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  type CalendarCaptionLayout,
  type CalendarDisabled,
  type CalendarMode,
  type CalendarSelection,
  type DateRange,
} from '@/components/ui/calendar';
import { Popover, type PopoverPresentation } from '@/components/ui/popover';

export type DatePickerMode = CalendarMode;

/** What a closed picker shows when nothing has been chosen yet. */
const DEFAULT_PLACEHOLDER = 'Pick a date';

/**
 * The chosen value as one line of text.
 *
 * A half-picked range reads as its start followed by a dash rather than as
 * just the start: the dash is what says the picker is waiting for the other
 * end, and without it a half range looks like a finished single date.
 */
function describe<Mode extends DatePickerMode>(
  mode: Mode,
  value: CalendarSelection[Mode] | undefined,
  locale: string | undefined,
  system: 'gregory' | 'islamic'
): string | null {
  if (!value) return null;
  const write = (date: Date) => calendarShortDate(date, system, locale);

  if (mode === 'range') {
    const range = value as DateRange;
    if (!range.from) return null;
    return range.to ? `${write(range.from)} – ${write(range.to)}` : `${write(range.from)} –`;
  }

  if (mode === 'multiple') {
    const days = value as Date[];
    if (!days.length) return null;
    if (days.length === 1) return write(days[0]!);
    return `${days.length} dates`;
  }

  return write(value as Date);
}

export interface DatePickerProps<Mode extends DatePickerMode = 'single'> {
  /** One day, several, or a span with two ends. */
  mode?: Mode;
  /** Controlled selection. Its shape follows `mode`. */
  selected?: CalendarSelection[Mode];
  /** Starting selection when uncontrolled. */
  defaultSelected?: CalendarSelection[Mode];
  onSelect?: (selected: CalendarSelection[Mode]) => void;
  /** Controlled open state of the panel. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** What the trigger reads when nothing has been chosen. */
  placeholder?: string;
  /** Override how the chosen value is written on the trigger. */
  format?: (selected: CalendarSelection[Mode]) => string;
  /** Anchored panel, or a sheet from the bottom of the screen. */
  presentation?: PopoverPresentation;
  /** Stop the trigger opening it. */
  disabled?: boolean;
  /** Days that cannot be picked: a list, a span, or a rule. */
  disabledDates?: CalendarDisabled;
  /** Earliest selectable day. */
  minDate?: Date;
  /** Latest selectable day. */
  maxDate?: Date;
  /** Earliest month the `dropdown` caption offers. Defaults to `minDate`. */
  startMonth?: Date;
  /** Latest month the `dropdown` caption offers. Defaults to `maxDate`. */
  endMonth?: Date;
  /** Months side by side inside the panel. */
  numberOfMonths?: number;
  /** `dropdown` swaps the month caption for month and year pickers. */
  captionLayout?: CalendarCaptionLayout;
  /** `0` is Sunday. */
  weekStartsOn?: number;
  /** Let a tap on a neighbouring month's day select it. Off by default. */
  selectOutsideDays?: boolean;
  /** BCP 47 tag for the month and weekday names, and for the trigger's text. */
  locale?: string;
  /**
   * Which calendar the months and day numbers are counted in. Forwarded to the
   * grid, and used for the trigger's own text so the two always agree.
   */
  calendar?: CalendarSystem;
  className?: string;
  /**
   * A trigger of your own. Given one, it is cloned with an `onPress` that opens
   * the panel — so a field row or an icon button can stand in for the default
   * button without this component knowing what either looks like.
   */
  children?: ReactElement<{ onPress?: () => void }> | ReactNode;
}

function DatePickerRoot<Mode extends DatePickerMode = 'single'>({
  mode = 'single' as Mode,
  selected,
  defaultSelected,
  onSelect,
  open: openProp,
  onOpenChange,
  placeholder = DEFAULT_PLACEHOLDER,
  format,
  presentation = 'popover',
  disabled = false,
  disabledDates,
  minDate,
  maxDate,
  startMonth,
  endMonth,
  numberOfMonths = 1,
  captionLayout = 'label',
  weekStartsOn = 0,
  selectOutsideDays = false,
  locale,
  calendar = 'gregory',
  className,
  children,
}: DatePickerProps<Mode>) {
  // Resolved here as well as in the grid, because the trigger's text has to be
  // written in the same calendar the cells were tapped in.
  const system = useMemo(() => resolveCalendar(calendar, locale), [calendar, locale]);
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState<CalendarSelection[Mode] | undefined>(
    defaultSelected
  );

  const isOpenControlled = openProp !== undefined;
  const open = isOpenControlled ? openProp : internalOpen;

  const isControlled = selected !== undefined;
  const value = (isControlled ? selected : internalSelected) as CalendarSelection[Mode];

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isOpenControlled, onOpenChange]
  );

  const handleSelect = useCallback(
    (next: CalendarSelection[Mode]) => {
      if (!isControlled) setInternalSelected(next);
      onSelect?.(next);

      // Done in one tap, so it closes on one. A range waits for its second end,
      // and a set of dates is only the caller's to call finished.
      if (mode === 'single' && next) setOpen(false);
      if (mode === 'range' && (next as DateRange | undefined)?.to) setOpen(false);
    },
    [isControlled, onSelect, mode, setOpen]
  );

  const label = useMemo(() => {
    if (format && value) return format(value);
    return describe(mode, value, locale, system);
  }, [format, value, mode, locale, system]);

  const trigger = children ?? (
    <Button
      variant="outline"
      disabled={disabled}
      className={cn('justify-start gap-2', className)}
    >
      <CalendarIcon size={16} />
      <Text className={label ? undefined : 'text-muted-foreground'}>
        {label ?? placeholder}
      </Text>
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} presentation={presentation}>
      <Popover.Trigger>{trigger as ReactElement<{ onPress?: () => void }>}</Popover.Trigger>
      {/* The padding is on the inner view, not the panel: in sheet mode a
          className on the panel is merged into the sheet's own padding and
          would replace it. `self-center` for the same reason — the panel does
          not have to know which presentation it ended up in. */}
      <Popover.Content width="content-fit">
        <View className="w-[308px] max-w-full self-center p-3">
          {/*
            Unbordered: the panel around it already draws one, and a card
            inside a card is a seam. The calendar frames itself only when it is
            standing on a page.
          */}
          <Calendar
            bordered={false}
            mode={mode}
            selected={value}
            onSelect={handleSelect}
            disabled={disabledDates}
            minDate={minDate}
            maxDate={maxDate}
            startMonth={startMonth}
            endMonth={endMonth}
            numberOfMonths={numberOfMonths}
            captionLayout={captionLayout}
            weekStartsOn={weekStartsOn}
            selectOutsideDays={selectOutsideDays}
            locale={locale}
            calendar={calendar}
          />
        </View>
      </Popover.Content>
    </Popover>
  );
}
DatePickerRoot.displayName = 'DatePicker';

export const DatePicker = Object.assign(DatePickerRoot, {
  Trigger: Popover.Trigger,
});
