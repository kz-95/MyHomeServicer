import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TIME_SLOTS } from './constants/time-slots';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

@Component({
    selector: 'app-calendar-picker',
    imports: [FormsModule],
    template: `
    <div class="input-row" (click)="toggleCollapsed()">
      <span class="date-display">{{ formattedDate }}</span>
      <span class="toggle-btn">{{ collapsed() ? '▾' : '▴' }}</span>
    </div>

    <div class="calendar-grid" [class.hidden]="collapsed()">
      <div class="month-header">
        <button type="button" (click)="prevMonth()">◀</button>
        <span>{{ monthYearLabel }}</span>
        <button type="button" (click)="nextMonth()">▶</button>
      </div>

      <div class="weekday-header">
        @for (day of weekdaysShort; track day) {
          <span>{{ day }}</span>
        }
      </div>

      <div class="day-grid">
        @for (d of days; track d.date) {
          <div
            class="day-cell"
            [class.past]="d.isPast"
            [class.today]="d.isToday"
            [class.selected]="d.date === selectedDate"
            (click)="selectDay(d.date)"
          >
            {{ d.dayOfMonth }}
          </div>
        }
      </div>
    </div>

    <div class="time-slot-row" [class.hidden]="collapsed()">
      @for (slot of visibleSlots; track slot.value) {
        <button
          type="button"
          class="pill"
          [class.active]="selectedSlot === slot.value"
          (click)="selectSlot(slot.value)"
        >
          {{ slot.label }}
        </button>
      }
    </div>
  `,
    styles: [
        `
      :host {
        display: block;
      }
      .input-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.55rem 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-input);
        background: var(--color-surface);
        cursor: pointer;
        transition: border-color var(--transition), box-shadow var(--transition);
      }
      .input-row:hover {
        border-color: var(--color-primary);
      }
      .date-display {
        font-size: 0.9rem;
        color: var(--color-text);
        font-family: var(--font-body);
      }
      .toggle-btn {
        font-size: 0.75rem;
        color: var(--color-muted);
        user-select: none;
      }
      .calendar-grid {
        border-top: 1px solid var(--color-border);
        padding-top: 0.6rem;
        margin-top: 0.3rem;
      }
      .month-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }
      .month-header button {
        background: none;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        font-size: 0.8rem;
        color: var(--color-text);
        transition: background var(--transition);
      }
      .month-header button:hover {
        background: var(--color-bg);
      }
      .month-header span {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .weekday-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        text-align: center;
        font-size: 0.8em;
        color: var(--color-muted);
        margin-bottom: 0.25rem;
      }
      .day-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
      }
      .day-cell {
        text-align: center;
        padding: 6px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.85rem;
        transition: background var(--transition), color var(--transition);
      }
      .day-cell:hover:not(.past) {
        background: var(--color-border);
      }
      .day-cell.today {
        font-weight: bold;
        color: var(--color-primary);
      }
      .day-cell.selected {
        background: var(--color-primary);
        color: white;
      }
      .day-cell.past {
        color: var(--color-muted);
        cursor: default;
        pointer-events: none;
        opacity: 0.4;
      }
      .time-slot-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .pill {
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        cursor: pointer;
        font-size: 0.82rem;
        font-family: var(--font-body);
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .pill:hover {
        background: var(--color-bg);
      }
      .pill.active {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
      }
      .hidden {
        display: none;
      }
    `,
    ]
})
export class CalendarPickerComponent {
  @Input() selectedDate = '';
  @Input() selectedSlot = '';
  @Input() minDate = new Date().toISOString().slice(0, 10);
  @Input() availableSlots: string[] = TIME_SLOTS.map((s) => s.value);

  @Output() selectedDateChange = new EventEmitter<string>();
  @Output() selectedSlotChange = new EventEmitter<string>();

  collapsed = signal(false);

  protected readonly weekdaysShort = WEEKDAYS_SHORT;

  private now = new Date();
  viewMonth = this.now.getMonth();
  viewYear = this.now.getFullYear();

  get monthYearLabel(): string {
    return `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`;
  }

  get days(): { date: string; dayOfMonth: number; isPast: boolean; isToday: boolean }[] {
    const firstDay = new Date(this.viewYear, this.viewMonth, 1);
    const startDay = firstDay.getDay();
    const startOffset = startDay === 0 ? -6 : 1 - startDay;
    const startDate = new Date(this.viewYear, this.viewMonth, 1 + startOffset);

    const result: { date: string; dayOfMonth: number; isPast: boolean; isToday: boolean }[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        dayOfMonth: d.getDate(),
        isPast: dateStr < this.minDate,
        isToday: dateStr === todayStr,
      });
    }

    return result;
  }

  get visibleSlots() {
    return TIME_SLOTS.filter((s) => this.availableSlots.includes(s.value));
  }

  get formattedDate(): string {
    if (!this.selectedDate) return 'Select a date';
    const d = new Date(this.selectedDate + 'T00:00:00');
    const day = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    const weekday = WEEKDAY_NAMES[d.getDay()];
    return `${day} ${month} ${year} (${weekday})`;
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  prevMonth(): void {
    if (this.viewMonth === 0) {
      this.viewMonth = 11;
      this.viewYear--;
    } else {
      this.viewMonth--;
    }
  }

  nextMonth(): void {
    if (this.viewMonth === 11) {
      this.viewMonth = 0;
      this.viewYear++;
    } else {
      this.viewMonth++;
    }
  }

  selectDay(date: string): void {
    if (date < this.minDate) return;
    this.selectedDate = date;
    this.selectedDateChange.emit(date);
  }

  selectSlot(value: string): void {
    this.selectedSlot = value;
    this.selectedSlotChange.emit(value);
  }
}
