export interface CronField {
  minute: string;
  hour: string;
  day: string;
  month: string;
  weekday: string;
  year?: string;
}

// Cron parser / next-run calculator (lightweight, minute-level search).
export class CronParser {
  private static readonly WEEKDAY_MAP: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
    "0": 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
  };

  private static readonly MONTH_MAP: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };

  static parseField(field: string, min: number, max: number): number[] {
    if (field === "*") return Array.from({ length: max - min + 1 }, (_, idx) => min + idx);

    const values: number[] = [];
    const parts = field.split(",");

    for (const part of parts) {
      if (part.includes("/")) {
        const [range, step] = part.split("/");
        const stepNum = parseInt(step, 10);

        if (range === "*") {
          for (let i = min; i <= max; i += stepNum) values.push(i);
        } else if (range.includes("-")) {
          const [start, end] = range.split("-");
          const startNum = this.parseValue(start, min, max);
          const endNum = this.parseValue(end, min, max);
          for (let i = startNum; i <= endNum; i += stepNum) values.push(i);
        }
      } else if (part.includes("-")) {
        const [start, end] = part.split("-");
        const startNum = this.parseValue(start, min, max);
        const endNum = this.parseValue(end, min, max);
        for (let i = startNum; i <= endNum; i += 1) values.push(i);
      } else {
        const value = this.parseValue(part, min, max);
        values.push(value);
      }
    }

    return [...new Set(values)].sort((a, b) => a - b);
  }

  private static parseValue(value: string, min: number, max: number): number {
    if (min === 0 && max === 6) {
      const upperValue = value.toUpperCase();
      if (this.WEEKDAY_MAP[upperValue] !== undefined) return this.WEEKDAY_MAP[upperValue]!;
    }

    if (min === 1 && max === 12) {
      const upperValue = value.toUpperCase();
      if (this.MONTH_MAP[upperValue] !== undefined) return this.MONTH_MAP[upperValue]!;
    }

    const num = parseInt(value, 10);
    if (num >= min && num <= max) return num;

    throw new Error(`ERR_INVALID_VALUE:${value}:${min}:${max}`);
  }

  static parse(cronExpression: string): { isValid: boolean; error?: string; fields?: CronField } {
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length !== 5 && parts.length !== 6) {
      return { isValid: false, error: `ERR_PARTS_COUNT:${parts.length}` };
    }

    try {
      const fields: CronField = {
        minute: parts[0]!,
        hour: parts[1]!,
        day: parts[2]!,
        month: parts[3]!,
        weekday: parts[4]!,
      };

      if (parts.length === 6) fields.year = parts[5]!;

      this.parseField(fields.minute, 0, 59);
      this.parseField(fields.hour, 0, 23);
      this.parseField(fields.day, 1, 31);
      this.parseField(fields.month, 1, 12);
      this.parseField(fields.weekday, 0, 6);
      if (fields.year) this.parseField(fields.year, 1970, 2100);

      return { isValid: true, fields };
    } catch (error) {
      return { isValid: false, error: error instanceof Error ? error.message : "ERR_PARSE" };
    }
  }

  static getNextRuns(cronExpression: string, count: number = 5): Date[] {
    const result = this.parse(cronExpression);
    if (!result.isValid || !result.fields) throw new Error(result.error || "ERR_INVALID_CRON");

    const fields = result.fields;
    const runs: Date[] = [];
    const now = new Date();

    const minutes = this.parseField(fields.minute, 0, 59);
    const hours = this.parseField(fields.hour, 0, 23);
    const days = this.parseField(fields.day, 1, 31);
    const months = this.parseField(fields.month, 1, 12);
    const weekdays = this.parseField(fields.weekday, 0, 6);

    const current = new Date(now);
    current.setSeconds(0);
    current.setMilliseconds(0);

    const oneYearLater = now.getTime() + 365 * 24 * 60 * 60 * 1000;
    while (runs.length < count && current.getTime() < oneYearLater) {
      current.setMinutes(current.getMinutes() + 1);

      const minute = current.getMinutes();
      const hour = current.getHours();
      const day = current.getDate();
      const month = current.getMonth() + 1;
      const weekday = current.getDay();

      if (
        minutes.includes(minute) &&
        hours.includes(hour) &&
        months.includes(month) &&
        days.includes(day) &&
        weekdays.includes(weekday)
      ) {
        runs.push(new Date(current));
      }
    }

    return runs.slice(0, count);
  }
}

