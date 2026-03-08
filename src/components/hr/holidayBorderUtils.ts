/**
 * Returns Tailwind border classes for a holiday column.
 * Consecutive holidays merge into one combined red outline:
 * - First in group: left border
 * - Last in group: right border
 * - All: top + bottom borders
 * Non-holidays return empty string.
 */
export function getHolidayBorderClass(
  dayIndex: number,
  weekDates: Date[],
  holidayDates: Set<string>,
  formatDate: (d: Date) => string
): string {
  const dateStr = formatDate(weekDates[dayIndex]);
  if (!holidayDates.has(dateStr)) return "";

  const prevIsHoliday = dayIndex > 0 && holidayDates.has(formatDate(weekDates[dayIndex - 1]));
  const nextIsHoliday = dayIndex < weekDates.length - 1 && holidayDates.has(formatDate(weekDates[dayIndex + 1]));

  const borders: string[] = ["border-y-2 border-y-destructive/60"];
  if (!prevIsHoliday) borders.push("border-l-2 border-l-destructive/60");
  if (!nextIsHoliday) borders.push("border-r-2 border-r-destructive/60");

  return borders.join(" ");
}
