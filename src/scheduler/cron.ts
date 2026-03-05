export interface CronParts {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseCron(expression: string): CronParts | null {
  const parts = expression.trim().toLowerCase().split(/\s+/);

  if (parts.length !== 5) {
    return null;
  }

  try {
    return {
      minute: parseCronPart(parts[0], 0, 59),
      hour: parseCronPart(parts[1], 0, 23),
      dayOfMonth: parseCronPart(parts[2], 1, 31),
      month: parseCronPart(parts[3], 1, 12, MONTH_NAMES),
      dayOfWeek: parseCronPart(parts[4], 0, 6, DAY_NAMES),
    };
  } catch {
    return null;
  }
}

function parseCronPart(
  part: string,
  min: number,
  max: number,
  names?: string[],
): number[] {
  if (part === "*") {
    return range(min, max);
  }

  const values: Set<number> = new Set();

  for (const segment of part.split(",")) {
    let [range, step] = segment.split("/");
    step = step ? step : "1";

    let start: number, end: number;

    if (range === "*") {
      start = min;
      end = max;
    } else if (range.includes("-")) {
      const [rangeStart, rangeEnd] = range.split("-");
      start = parseValue(rangeStart, min, max, names);
      end = parseValue(rangeEnd, min, max, names);
    } else {
      start = parseValue(range, min, max, names);
      end = start;
    }

    const stepNum = parseInt(step, 10);
    if (isNaN(stepNum) || stepNum < 1) {
      throw new Error(`Invalid step: ${step}`);
    }

    for (let i = start; i <= end; i += stepNum) {
      values.add(i);
    }
  }

  const result = Array.from(values).sort((a, b) => a - b);
  return result.filter((v) => v >= min && v <= max);
}

function parseValue(value: string, min: number, _max: number, names?: string[]): number {
  if (names) {
    const index = names.indexOf(value);
    if (index !== -1) {
      return index + (min === 1 ? 1 : 0);
    }
  }

  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid value: ${value}`);
  }

  return num;
}

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

export function validateCron(expression: string): { valid: boolean; error?: string } {
  const parts = parseCron(expression);

  if (!parts) {
    return {
      valid: false,
      error:
        "Invalid cron expression format. Expected 5 fields: minute hour day-of-month month day-of-week",
    };
  }

  return { valid: true };
}

export function getNextOccurrence(expression: string, from: Date = new Date()): Date | null {
  const parts = parseCron(expression);
  if (!parts) return null;

  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    if (!parts.month.includes(next.getMonth() + 1)) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0);
      next.setMinutes(0);
      continue;
    }

    if (!parts.dayOfMonth.includes(next.getDate())) {
      next.setDate(next.getDate() + 1);
      next.setHours(0);
      next.setMinutes(0);
      continue;
    }

    const dayOfWeek = next.getDay();
    if (!parts.dayOfWeek.includes(dayOfWeek)) {
      next.setDate(next.getDate() + 1);
      next.setHours(0);
      next.setMinutes(0);
      continue;
    }

    if (!parts.hour.includes(next.getHours())) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      continue;
    }

    if (!parts.minute.includes(next.getMinutes())) {
      next.setMinutes(next.getMinutes() + 1);
      continue;
    }

    return next;
  }

  return null;
}

export function getNextOccurrences(
  expression: string,
  count: number,
  from: Date = new Date(),
): Date[] {
  const results: Date[] = [];
  let current = from;

  for (let i = 0; i < count; i++) {
    const next = getNextOccurrence(expression, current);
    if (!next) break;
    results.push(next);
    current = new Date(next.getTime() + 60000);
  }

  return results;
}
