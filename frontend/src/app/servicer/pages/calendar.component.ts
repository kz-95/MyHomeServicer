import { Component, OnInit, inject, signal, computed } from '@angular/core';

import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';

interface CalendarDay {
  date: Date;
  dateStr: string;
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  bookings: CalendarBooking[];
}

interface CalendarBooking {
  id: string;
  timeSlot: string;
  status: string;
  price: number;
  paymentMode: string;
  paid: boolean;
  category: string;
  contactName: string;
  contactNumber: string;
  address: string;
  postcode: string;
  district: string;
  state: string;
  notes: string | null;
  serviceDetails: Record<string, unknown> | null;
  customerName: string;
  isUrgent?: boolean;
}

interface CalendarData {
  month: string;
  data: Record<string, CalendarBooking[]>;
}

@Component({
    selector: 'app-servicer-calendar',
    host: { class: 'page-enter' },
    imports: [FormsModule, ModalComponent],
    template: `
    <h1>Calendar</h1>
    <p class="muted">View your scheduled jobs and manage your working hours.</p>

    <!-- Tab switcher -->
    <div class="tabs">
      <button class="tab" [class.active]="activeTab() === 'calendar'" (click)="activeTab.set('calendar')">
        Calendar
      </button>
      <button class="tab" [class.active]="activeTab() === 'workhours'" (click)="activeTab.set('workhours')">
        Work Hours
      </button>
    </div>

    <!-- ───────────── CALENDAR TAB ───────────── -->
    @if (activeTab() === 'calendar') {
      @if (loading()) {
        <p class="muted tab-body">Loading calendar…</p>
      } @else if (loadFailed()) {
        <p class="err tab-body">Could not load calendar. Please refresh.</p>
      } @else {
        <div class="tab-body">
          <!-- Month navigation + status filters -->
          <div class="cal-nav">
            <button class="nav-btn" (click)="prevMonth()">◀</button>
            <strong class="nav-title">{{ monthLabel() }}</strong>
            <button class="nav-btn" (click)="nextMonth()">▶</button>

            <div class="status-filters">
              <button type="button" class="sf-all" [class.on]="allStatusOn()" (click)="toggleAllStatus()">All</button>
              @for (s of STATUS_FILTERS; track s.key) {
                <button type="button" class="sf-btn" [class.off]="!statusFilter()[s.key]"
                        (click)="toggleStatus(s.key)" [title]="s.label">
                  <span class="sf-dot" [class]="statusFilter()[s.key] ? s.cls : 'sf-dot-off'"></span>
                  <span class="sf-label">{{ s.label }}</span>
                </button>
              }
            </div>

            <button class="btn-ghost btn-today" (click)="goToday()">Today</button>
          </div>

          <!-- Day-of-week header -->
          <div class="cal-header">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span>
            <span>Fri</span><span>Sat</span><span>Sun</span>
          </div>

          <!-- Calendar grid -->
          <div class="cal-grid">
            @for (day of days(); track day.dateStr) {
              <div class="cal-cell"
                   [class.other-month]="!day.isCurrentMonth"
                   [class.today]="day.isToday"
                   (click)="openDay(day)">
                <span class="day-num">{{ day.day }}</span>
                @if (day.bookings.length > 0) {
                  <div class="day-bookings">
                    @for (b of day.bookings.slice(0, 3); track b.id) {
                      <div class="day-booking"
                           [class.bg-completed]="b.status === 'completed'"
                           [class.bg-active]="b.status === 'in_progress'"
                           [class.bg-confirmed]="b.status === 'confirmed'"
                           [class.bg-pending]="b.status === 'pending_confirm'"
                           [class.bg-cancelled]="b.status === 'cancelled'">
                        <span class="bk-cat">{{ b.category }}</span>
                        <span class="bk-time">{{ b.timeSlot }}</span>
                        @if (b.isUrgent) { <span class="dot-urgent"></span> }
                      </div>
                    }
                    @if (day.bookings.length > 3) {
                      <span class="bk-more">+{{ day.bookings.length - 3 }} more</span>
                    }
                  </div>
                }
              </div>
            }
          </div>

        </div>
      }
    }

    <!-- ───────────── WORK HOURS TAB ───────────── -->
    @if (activeTab() === 'workhours') {
      <div class="tab-body">
        <p class="muted wh-desc">Toggle the time slots you are available to accept bookings.</p>

        @if (loadingSchedule()) {
          <p class="muted">Loading schedule…</p>
        } @else {
          <div class="schedule-grid">
            <div class="schedule-header">
              <button type="button" class="schedule-corner" (click)="toggleAll()"
                      [class.on]="allOn()"
                      title="Select or clear every slot">
                {{ allOn() ? 'Clear all' : 'Select all' }}
              </button>
              @for (day of WEEKDAYS; track day) {
                <button type="button" class="schedule-col-head" (click)="toggleColumn(day)"
                        [class.on]="columnOn()[day]"
                        title="Toggle the whole {{ DAY_LABELS[day] }} column">{{ DAY_LABELS[day] }}</button>
              }
            </div>
            @for (slot of TIME_SLOTS; track slot) {
              <div class="schedule-row">
                <button type="button" class="schedule-row-label" (click)="toggleRow(slot)"
                        [class.on]="rowOn()[slot]"
                        title="Toggle the whole {{ SLOT_LABELS[slot] }} row">{{ SLOT_LABELS[slot] }}</button>
                @for (day of WEEKDAYS; track day) {
                  <button
                    type="button"
                    class="schedule-cell"
                    [class.on]="scheduleGrid()[day + '-' + slot]"
                    (click)="toggleCell(day, slot)"
                  >{{ scheduleGrid()[day + '-' + slot] ? '✓' : '' }}</button>
                }
              </div>
            }
          </div>

          @if (scheduleError()) {
            <p class="err">{{ scheduleError() }}</p>
          }
          <div class="wh-actions">
            <button class="btn-primary" (click)="openSaveSchedule()" [disabled]="savingSchedule()">
              {{ savingSchedule() ? 'Saving…' : 'Save schedule' }}
            </button>
          </div>
        }
      </div>

      @if (saveScheduleOpen()) {
        <app-modal [open]="true" title="Confirm schedule" (closed)="saveScheduleOpen.set(false)">
          <form class="pin-form" (ngSubmit)="doSaveSchedule()">
            <p class="muted">Enter your PIN to save working hours.</p>
            <label>PIN
              <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric"
                     [(ngModel)]="scheduleConfirmPin" name="schpin" />
            </label>
            @if (scheduleError()) {
              <p class="err">{{ scheduleError() }}</p>
            }
            <div class="modal-actions">
              <button type="button" class="btn-ghost" (click)="saveScheduleOpen.set(false)">Cancel</button>
              <button type="submit" class="btn-primary" [disabled]="savingSchedule()">
                {{ savingSchedule() ? 'Saving…' : 'Confirm' }}
              </button>
            </div>
          </form>
        </app-modal>
      }
    }

    <!-- ───────────── DAY DETAIL OVERLAY ───────────── -->
    @if (dayModalOpen()) {
      <app-modal [open]="true" [title]="selectedDayTitle()" (closed)="closeDayModal()">
        @if (selectedDay()?.bookings?.length) {
          <div class="day-modal-list">
            @for (b of selectedDay()!.bookings; track b.id) {
              <div class="dm-card">
                <!-- Row 1: Status + Time + Payment + Price -->
                <div class="dm-row1">
                  <span class="dm-status-dot" [class]="statusCls(b.status)"></span>
                  <span class="dm-status-label">{{ statusLabel(b.status) }}</span>
                  <span class="dm-time">{{ slotLabelFor(b.timeSlot) }}</span>
                  <span class="dm-payment">{{ paymentLabel(b) }}</span>
                  <span class="dm-price">RM {{ b.price.toFixed(2) }}</span>
                </div>

                <!-- Row 2: Category -->
                <div class="dm-category">{{ b.category }}</div>

                <!-- Row 3: Contact + Phone with copy -->
                <div class="dm-row3">
                  <span class="dm-contact">👤 {{ b.contactName || b.customerName }}</span>
                  <span class="dm-phone">📞 {{ b.contactNumber }}</span>
                  @if (b.contactNumber) {
                    <button type="button" class="btn-copy" (click)="copyText(b.contactNumber)">📋 Copy</button>
                  }
                </div>

                <!-- Row 4: Address with copy -->
                @if (b.address) {
                  <div class="dm-row4">
                    <span class="dm-addr">📍 {{ fullAddress(b) }}</span>
                    <button type="button" class="btn-copy" (click)="copyText(fullAddress(b))">📋 Copy</button>
                  </div>
                }

                <!-- Row 5: Job Description (expandable) + View Job -->
                <div class="dm-row5">
                  <button type="button" class="dm-expand" (click)="toggleExpand(b.id)">
                    {{ expandedJobId() === b.id ? '▾' : '▸' }} Job Description
                  </button>
                  <button type="button" class="btn-outline dm-view-job" (click)="viewJob(b.id)">View Job ↗</button>
                </div>

                <!-- Expanded description -->
                @if (expandedJobId() === b.id) {
                  <div class="dm-description">
                    @if (b.notes) {
                      <p class="dm-notes">"{{ b.notes }}"</p>
                    }
                    @if (b.serviceDetails) {
                      <ul class="dm-details">
                        @for (entry of flattenDetails(b.serviceDetails); track entry.key) {
                          <li><strong>{{ entry.key }}:</strong> {{ entry.value }}</li>
                        }
                      </ul>
                    }
                    @if (!b.notes && (!b.serviceDetails || !hasDetailContent(b.serviceDetails))) {
                      <p class="muted">No description provided.</p>
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <p class="muted">No bookings on this day.</p>
        }
      </app-modal>
    }
  `,
    styles: [`
    :host { display: block; max-width: 1000px; margin: 0 auto; }
    h1 { margin-bottom: 0.2rem; }
    .err { color: var(--color-danger); }

    /* ── Tabs ── */
    .tabs {
      display: flex;
      gap: 0.4rem;
      margin: 1rem 0 0;
    }
    .tab {
      background: transparent;
      border: none;
      border-radius: 999px;
      padding: 0.55rem 1.2rem;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-muted);
      cursor: pointer;
      transition: background var(--transition), color var(--transition);
    }
    .tab.active {
      background: var(--color-primary);
      background: var(--gradient-sidebar);
      color: #fff;
      font-weight: 600;
      box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
    }
    .tab:hover:not(.active) { color: var(--color-text); background: var(--color-bg); }

    .tab-body { margin-top: 1.25rem; }

    /* ── Calendar ── */
    .cal-nav {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
      margin-bottom: 1rem;
    }

    /* ── Status filter buttons (in nav) ── */
    .status-filters {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .sf-all {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      min-height: 36px;
      display: inline-flex;
      align-items: center;
    }
    .sf-all:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .sf-all.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
    .sf-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: 999px;
      font-size: 0.72rem;
      color: var(--color-text);
      padding: 0.35rem 0.6rem 0.35rem 0.4rem;
      cursor: pointer;
      transition: opacity 0.15s, border-color 0.15s;
      min-height: 36px;
    }
    .sf-btn:hover { border-color: var(--color-primary); }
    .sf-btn.off { opacity: 0.45; }
    .sf-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    .sf-dot-off { background: var(--color-border); }
    .nav-btn {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.45rem 0.75rem;
      font-size: 0.9rem;
      cursor: pointer;
      color: var(--color-text);
      transition: background var(--transition);
      min-height: 38px;
    }
    .nav-btn:hover { background: var(--color-bg); }
    .nav-title { font-size: 1.05rem; min-width: 130px; text-align: center; }
    .btn-today { font-size: 0.78rem; padding: 0.625rem 0.7rem; margin-left: auto; }

    .cal-header {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      text-align: center;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-muted);
      margin-bottom: 0.3rem;
    }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      background: var(--color-border);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .cal-cell {
      background: var(--color-bg);
      min-height: 100px;
      padding: 0.3rem;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: background var(--transition);
    }
    .cal-cell:hover { background: var(--color-surface); }
    .cal-cell:not(.other-month) { cursor: pointer; }
    .cal-cell.other-month { opacity: 0.3; pointer-events: none; }
    .cal-cell.today { outline: 2px solid var(--color-primary); outline-offset: -2px; }

    /* ── Day detail overlay ── */
    .day-modal-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 65vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .dm-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.75rem;
      background: var(--color-bg);
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .dm-row1 {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.4rem 0.6rem;
    }
    .dm-status-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
    .dm-status-label { font-size: 0.76rem; font-weight: 600; color: var(--color-muted); }
    .dm-time { font-size: 0.82rem; color: var(--color-muted); white-space: nowrap; }
    .dm-payment { font-size: 0.78rem; color: var(--color-muted); white-space: nowrap; }
    .dm-price { margin-left: auto; font-weight: 700; font-size: 1rem; white-space: nowrap; }

    .dm-category { font-weight: 700; font-size: 1rem; }

    .dm-row3, .dm-row4 {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.84rem;
    }
    .dm-contact, .dm-phone, .dm-addr { color: var(--color-text); }
    .dm-addr { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dm-phone  { white-space: nowrap; }

    .btn-copy {
      flex-shrink: 0;
      font-size: 0.7rem;
      padding: 0.2rem 0.55rem;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      background: var(--color-surface);
      color: var(--color-muted);
      cursor: pointer;
      line-height: 1.4;
    }
    .btn-copy:hover { border-color: var(--color-primary); color: var(--color-primary); }

    .dm-row5 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.15rem;
    }
    .dm-expand {
      background: transparent;
      border: none;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--color-primary);
      cursor: pointer;
      padding: 0.4rem 0;
      text-align: left;
      min-height: 36px;
      touch-action: manipulation;
    }
    .dm-expand:hover { text-decoration: underline; }
    .dm-view-job {
      font-size: 0.78rem;
      padding: 0.3rem 0.7rem;
      white-space: nowrap;
    }

    .dm-description {
      padding: 0.5rem 0 0.15rem;
      border-top: 1px solid var(--color-border);
    }
    .dm-notes { font-style: italic; color: var(--color-muted); margin: 0 0 0.5rem; font-size: 0.84rem; }
    .dm-details { margin: 0; padding-left: 1.2rem; font-size: 0.82rem; }
    .dm-details li { margin-bottom: 0.2rem; }
    .dm-details strong { text-transform: capitalize; }
    .cal-cell.today .day-num {
      background: var(--color-primary);
      color: #fff;
      border-radius: 999px;
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .day-num { font-size: 0.82rem; font-weight: 600; margin-bottom: 2px; }
    .day-bookings { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .day-booking {
      font-size: 0.65rem;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      color: #fff;
      cursor: default;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bk-cat { font-weight: 600; }
    .bk-time { opacity: 0.85; margin-left: 0.2rem; }
    .dot-urgent { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-danger); margin-left: 3px; flex-shrink: 0; }
    .bk-more { font-size: 0.65rem; color: var(--color-muted); text-align: center; }

    .bg-completed { background: #16a34a; }
    .bg-active     { background: #2563eb; }
    .bg-confirmed  { background: #9333ea; }
    .bg-pending    { background: #d97706; }
    .bg-cancelled  { background: #6b7280; }

    /* ── Work Hours ── */
    .wh-desc { margin: 0 0 1rem; }

    .schedule-grid {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-x: auto;
      margin-bottom: 0.8rem;
    }
    .schedule-header {
      display: grid;
      grid-template-columns: 132px repeat(7, minmax(40px, 1fr));
      gap: 2px;
      margin-bottom: 2px;
    }
    /* Select-all toggle (top-left corner) */
    .schedule-corner {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--color-text);
      cursor: pointer;
      padding: 0.25rem 0.3rem;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .schedule-corner:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .schedule-corner.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
    /* Day column headers - click toggles the whole column */
    .schedule-col-head {
      text-align: center;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--color-muted);
      padding: 0.25rem 0;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .schedule-col-head:hover { background: var(--color-bg); color: var(--color-text); }
    .schedule-col-head.on { color: var(--color-primary); text-decoration: underline; }
    .schedule-row {
      display: grid;
      grid-template-columns: 132px repeat(7, minmax(40px, 1fr));
      gap: 2px;
    }
    /* Slot row labels - click toggles the whole row */
    .schedule-row-label {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--color-muted);
      display: flex;
      align-items: center;
      text-align: left;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      padding: 0 0.3rem;
      transition: background 0.15s, color 0.15s;
    }
    .schedule-row-label:hover { background: var(--color-bg); color: var(--color-text); }
    .schedule-row-label.on { color: var(--color-primary); }
    .schedule-cell {
      height: 61px;
      background: var(--color-border);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      color: transparent;
      transition: background 0.15s, color 0.15s;
    }
    .schedule-cell.on { background: var(--color-primary); color: #fff; }
    .schedule-cell:hover { opacity: 0.75; }

    .wh-actions { margin-top: 0.5rem; }

    .pin-form { display: flex; flex-direction: column; gap: 0.6rem; }
    .pin-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.88rem; font-weight: 500; }
    .pin-form input { max-width: 180px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }

    /* ── Responsive: tablet (≤760px) ── */
    @media (max-width: 760px) {
      .cal-nav {
        justify-content: center;
      }
      .nav-title {
        min-width: 0;
        flex: 1 0 100%;
        order: -1;
      }
      .btn-today { margin-left: 0; }

      .cal-cell {
        min-height: 72px;
        padding: 0.2rem 0.15rem;
      }
      .day-num { font-size: 0.72rem; }
      .day-booking {
        font-size: 0.55rem;
        padding: 0.08rem 0.2rem;
      }
      .cal-cell.today .day-num {
        width: 20px;
        height: 20px;
        font-size: 0.7rem;
      }

      /* Work hours: shrink label column */
      .schedule-header,
      .schedule-row {
        grid-template-columns: 90px repeat(7, minmax(36px, 1fr));
      }
      .schedule-row-label {
        font-size: 0.7rem;
        padding: 0 0.15rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .schedule-cell { height: 48px; font-size: 0.72rem; }
      .schedule-corner { font-size: 0.65rem; padding: 0.2rem 0.25rem; }
      .schedule-col-head { font-size: 0.65rem; }
    }

    /* ── Responsive: mobile (≤560px) ── */
    @media (max-width: 560px) {
      .tabs {
        gap: 0;
      }
      .tab {
        padding: 0.5rem 0.6rem;
        font-size: 0.82rem;
      }

      /* Nav: stack month title above nav buttons */
      .cal-nav {
        display: grid;
        grid-template-columns: auto 1fr auto;
        grid-template-areas:
          "title title title"
          "prev today next";
        gap: 0.4rem;
        align-items: center;
        margin-bottom: 0.6rem;
      }
      .nav-title {
        grid-area: title;
        text-align: center;
        font-size: 0.95rem;
        min-width: 0;
        flex: none;
        order: 0;
      }
      .nav-btn { grid-area: auto; font-size: 0.82rem; padding: 0.625rem 0.625rem; }
      .btn-today { grid-area: today; margin-left: 0; }

      /* Status filters: full-width scroll row */
      .status-filters {
        order: 999;
        width: 100%;
        flex-wrap: nowrap;
        overflow-x: auto;
        gap: 0.25rem;
        padding-bottom: 0.2rem;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .status-filters::-webkit-scrollbar { display: none; }
      .sf-all, .sf-btn {
        font-size: 0.68rem;
        padding: 0.35rem 0.55rem;
        flex-shrink: 0;
        white-space: nowrap;
        min-height: 32px;
        display: inline-flex;
        align-items: center;
      }

      /* Calendar grid: compact cells, hide booking text */
      .cal-header { font-size: 0.65rem; }
      .cal-cell {
        min-height: 56px;
        padding: 0.15rem 0.1rem;
        gap: 1px;
      }
      .day-num { font-size: 0.68rem; }
      .cal-cell.today .day-num {
        width: 18px;
        height: 18px;
        font-size: 0.65rem;
      }
      .day-booking {
        font-size: 0.5rem;
        padding: 0.06rem 0.15rem;
      }
      .bk-cat { font-size: 0.48rem; }
      .bk-time { display: none; }
      .bk-more { font-size: 0.5rem; }

      /* Work hours: minimal label, full-width scroll */
      .schedule-header,
      .schedule-row {
        grid-template-columns: 52px repeat(7, minmax(32px, 1fr));
      }
      .schedule-row-label {
        font-size: 0.62rem;
        padding: 0 0.1rem;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .schedule-cell { height: 40px; font-size: 0.68rem; border-radius: 4px; }
      .schedule-corner { font-size: 0.6rem; padding: 0.15rem 0.2rem; }
      .schedule-col-head { font-size: 0.6rem; padding: 0.15rem 0; }

      /* Day modal cards */
      .dm-row1 {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
      }
      .dm-price { margin-left: 0; }
      .dm-row3, .dm-row4 {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
      }
      .dm-addr { white-space: normal; overflow: visible; }
      .dm-row5 {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.35rem;
      }
      .dm-view-job {
        width: 100%;
        text-align: center;
      }
      .btn-copy {
        padding: 0.35rem 0.6rem;
        font-size: 0.72rem;
        min-height: 36px;
        display: inline-flex;
        align-items: center;
      }
    }
  `]
})
export class ServicerCalendarComponent implements OnInit {
  private api    = inject(ApiService);
  private toast  = inject(ToastService);
  private router = inject(Router);

  activeTab = signal<'calendar' | 'workhours'>('calendar');

  // ── Calendar ────────────────────────────────────────────────────────────────
  viewYear  = signal(new Date().getFullYear());
  viewMonth = signal(new Date().getMonth()); // 0-indexed
  loading      = signal(true);
  loadFailed   = signal(false);
  calendarData = signal<CalendarData | null>(null);

  // ── Status filters (nav row) ─────────────────────────────────────────────────
  readonly STATUS_FILTERS = [
    { key: 'pending_confirm', label: 'Pending',     cls: 'bg-pending' },
    { key: 'confirmed',       label: 'Confirmed',   cls: 'bg-confirmed' },
    { key: 'in_progress',     label: 'In progress', cls: 'bg-active' },
    { key: 'completed',       label: 'Completed',   cls: 'bg-completed' },
    { key: 'cancelled',       label: 'Cancelled',   cls: 'bg-cancelled' },
  ] as const;

  statusFilter = signal<Record<string, boolean>>(
    Object.fromEntries(this.STATUS_FILTERS.map(s => [s.key, true])),
  );

  allStatusOn = computed(() => {
    const f = this.statusFilter();
    return this.STATUS_FILTERS.every(s => f[s.key]);
  });

  toggleStatus(key: string): void {
    this.statusFilter.update(f => ({ ...f, [key]: !f[key] }));
  }

  toggleAllStatus(): void {
    const turnOn = !this.allStatusOn();
    this.statusFilter.set(
      Object.fromEntries(this.STATUS_FILTERS.map(s => [s.key, turnOn])),
    );
  }

  // ── Day detail overlay ───────────────────────────────────────────────────────
  dayModalOpen = signal(false);
  selectedDay  = signal<CalendarDay | null>(null);

  selectedDayTitle = computed(() => {
    const d = this.selectedDay();
    return d
      ? d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
  });

  openDay(day: CalendarDay): void {
    this.selectedDay.set(day);
    this.dayModalOpen.set(true);
  }

  /** Booking status -> human label (reuses the filter definitions). */
  statusLabel(status: string): string {
    return this.STATUS_FILTERS.find(s => s.key === status)?.label ?? status;
  }

  /** Booking status -> colour-box class. */
  statusCls(status: string): string {
    return this.STATUS_FILTERS.find(s => s.key === status)?.cls ?? 'sf-dot-off';
  }

  /** Time slot key -> readable label (falls back to the raw value). */
  slotLabelFor(slot: string): string {
    return this.SLOT_LABELS[slot] ?? slot;
  }

  /** Close the day modal and reset expanded state. */
  closeDayModal(): void {
    this.dayModalOpen.set(false);
    this.expandedJobId.set(null);
  }

  /** Payment mode + paid/unpaid label. */
  paymentLabel(b: CalendarBooking): string {
    const u = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (b.paymentMode === 'pay_now')   return `${u(b.paymentMode)} · Paid`;
    if (b.paymentMode === 'cash')       return `${u(b.paymentMode)} · ${b.paid ? 'Paid' : 'Unpaid'}`;
    return `${u(b.paymentMode)} · Unpaid`;
  }

  /** Full address line from components. */
  fullAddress(b: CalendarBooking): string {
    return [b.address, b.postcode, b.district, b.state].filter(Boolean).join(', ');
  }

  /** Copy text to clipboard. */
  async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard');
    } catch {
      this.toast.error('Copy failed');
    }
  }

  /** Expand/collapse job description — only one open at a time. */
  expandedJobId = signal<string | null>(null);
  toggleExpand(id: string): void {
    this.expandedJobId.set(this.expandedJobId() === id ? null : id);
  }

  /** View Job — navigate (mobile) or open in new tab (desktop). */
  viewJob(id: string): void {
    const url = this.router.serializeUrl(
      this.router.createUrlTree([routeFor('servicer.jobs.detail', { id })]),
    );
    if (window.innerWidth <= 760) {
      this.dayModalOpen.set(false);
      this.router.navigate([routeFor('servicer.jobs.detail', { id })]);
    } else {
      window.open(url, '_blank');
    }
  }

  /** Flatten serviceDetails object to key/value pairs for display. */
  flattenDetails(details: Record<string, unknown>): { key: string; value: string }[] {
    return Object.entries(details).map(([key, val]) => ({
      key: key.replace(/_/g, ' '),
      value: Array.isArray(val) ? val.join(', ') : String(val ?? ''),
    }));
  }

  /** Check if serviceDetails has any meaningful content. */
  hasDetailContent(details: Record<string, unknown>): boolean {
    return Object.values(details).some(v => v !== null && v !== undefined && v !== '');
  }

  private readonly weekdayOffset = 1; // Monday-first

  monthLabel = computed(() => {
    const d = new Date(this.viewYear(), this.viewMonth(), 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  days = computed(() => {
    const year  = this.viewYear();
    const month = this.viewMonth();
    const data  = this.calendarData()?.data ?? {};
    const today    = new Date();
    const todayStr = this.localDateStr(today);

    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);

    let startDow = first.getDay() - this.weekdayOffset;
    if (startDow < 0) startDow += 7;

    const days: CalendarDay[] = [];

    const prevLast = new Date(year, month, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevLast.getDate() - i);
      days.push(this.makeDay(d, false, data, todayStr));
    }
    for (let i = 1; i <= last.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push(this.makeDay(d, true, data, todayStr));
    }
    while (days.length < 42) {
      const lastDay = days[days.length - 1]?.date ?? last;
      const next = new Date(lastDay);
      next.setDate(next.getDate() + 1);
      days.push(this.makeDay(next, false, data, todayStr));
    }

    return days;
  });

  /**
   * Local (browser-timezone) YYYY-MM-DD. Never use toISOString() here - that is
   * UTC, and for a KL (+8) browser a local-midnight Date serialises to the
   * PREVIOUS day, shifting the "today" marker and every booking by one cell.
   */
  private localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private makeDay(
    date: Date,
    isCurrentMonth: boolean,
    data: Record<string, CalendarBooking[]>,
    todayStr: string,
  ): CalendarDay {
    const dateStr = this.localDateStr(date);
    const filter = this.statusFilter();
    return {
      date,
      dateStr,
      day: date.getDate(),
      isToday: dateStr === todayStr,
      isCurrentMonth,
      bookings: (data[dateStr] ?? []).filter(b => filter[b.status] !== false),
    };
  }

  // ── Work Hours ──────────────────────────────────────────────────────────────
  readonly WEEKDAYS  = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  readonly TIME_SLOTS = ['morning', 'noon', 'afternoon', 'evening', 'night'];
  readonly DAY_LABELS: Record<string, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
    fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };
  readonly SLOT_LABELS: Record<string, string> = {
    morning: 'Morning (9:00–11:00)', noon: 'Noon (11:00–13:00)', afternoon: 'Afternoon (13:00–15:00)', evening: 'Evening (15:00–17:00)', night: 'Night (17:00–22:00)',
  };

  scheduleGrid    = signal<Record<string, boolean>>({});
  loadingSchedule = signal(false);
  savingSchedule  = signal(false);
  scheduleError   = signal('');
  saveScheduleOpen   = signal(false);
  scheduleConfirmPin = '';

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadMonth();
    this.loadSchedule();
  }

  // ── Calendar methods ─────────────────────────────────────────────────────────
  prevMonth(): void {
    const m = this.viewMonth() - 1;
    if (m < 0) { this.viewMonth.set(11); this.viewYear.update(y => y - 1); }
    else        { this.viewMonth.set(m); }
    this.loadMonth();
  }

  nextMonth(): void {
    const m = this.viewMonth() + 1;
    if (m > 11) { this.viewMonth.set(0); this.viewYear.update(y => y + 1); }
    else         { this.viewMonth.set(m); }
    this.loadMonth();
  }

  goToday(): void {
    const now = new Date();
    this.viewYear.set(now.getFullYear());
    this.viewMonth.set(now.getMonth());
    this.loadMonth();
  }

  private loadMonth(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    const monthStr = `${this.viewYear()}-${String(this.viewMonth() + 1).padStart(2, '0')}`;
    this.api.get<CalendarData>(`/servicer/calendar?month=${monthStr}`).subscribe({
      next:  r  => { this.calendarData.set(r); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  // ── Work Hours methods ───────────────────────────────────────────────────────
  private loadSchedule(): void {
    this.loadingSchedule.set(true);
    this.api.get<{ data: { weekday: string; timeSlot: string; isAvailable: boolean }[] }>(
      '/servicer/me/schedule',
    ).subscribe({
      next: r => {
        const grid: Record<string, boolean> = {};
        for (const e of r.data ?? []) {
          grid[`${e.weekday}-${e.timeSlot}`] = e.isAvailable;
        }
        this.scheduleGrid.set(grid);
        this.loadingSchedule.set(false);
      },
      error: () => this.loadingSchedule.set(false),
    });
  }

  toggleCell(day: string, slot: string): void {
    const key = `${day}-${slot}`;
    this.scheduleGrid.update(g => ({ ...g, [key]: !g[key] }));
  }

  /** All grid keys (day-slot). */
  private allKeys(): string[] {
    return this.WEEKDAYS.flatMap(d => this.TIME_SLOTS.map(s => `${d}-${s}`));
  }

  /**
   * Set every given key on, unless they are ALL already on - then turn them off.
   * Drives the column / row / select-all toggles.
   */
  private toggleKeys(keys: string[]): void {
    this.scheduleGrid.update(g => {
      const allOn = keys.every(k => g[k]);
      const next = { ...g };
      for (const k of keys) next[k] = !allOn;
      return next;
    });
  }

  toggleColumn(day: string): void {
    this.toggleKeys(this.TIME_SLOTS.map(s => `${day}-${s}`));
  }

  toggleRow(slot: string): void {
    this.toggleKeys(this.WEEKDAYS.map(d => `${d}-${slot}`));
  }

  toggleAll(): void {
    this.toggleKeys(this.allKeys());
  }

  /** True when every slot is selected (drives the Select all / Clear all label). */
  allOn = computed(() => {
    const g = this.scheduleGrid();
    return this.allKeys().every(k => g[k]);
  });

  /** Per-day: true when all slots in that column are on (highlights the day head). */
  columnOn = computed(() => {
    const g = this.scheduleGrid();
    const out: Record<string, boolean> = {};
    for (const d of this.WEEKDAYS) out[d] = this.TIME_SLOTS.every(s => g[`${d}-${s}`]);
    return out;
  });

  /** Per-slot: true when all days in that row are on (highlights the slot label). */
  rowOn = computed(() => {
    const g = this.scheduleGrid();
    const out: Record<string, boolean> = {};
    for (const s of this.TIME_SLOTS) out[s] = this.WEEKDAYS.every(d => g[`${d}-${s}`]);
    return out;
  });

  openSaveSchedule(): void {
    this.scheduleConfirmPin = '';
    this.scheduleError.set('');
    this.saveScheduleOpen.set(true);
  }

  doSaveSchedule(): void {
    if (!this.scheduleConfirmPin) { this.scheduleError.set('PIN is required.'); return; }
    this.savingSchedule.set(true);
    this.scheduleError.set('');
    const grid  = this.scheduleGrid();
    const slots = this.WEEKDAYS.flatMap(day =>
      this.TIME_SLOTS.map(slot => ({
        weekday:   day,
        timeSlot:  slot,
        available: !!grid[`${day}-${slot}`],
      })),
    );
    this.api.patch('/servicer/me/schedule', { slots }, { 'x-action-pin': this.scheduleConfirmPin }).subscribe({
      next: () => {
        this.savingSchedule.set(false);
        this.saveScheduleOpen.set(false);
        this.toast.success('Working hours saved.');
      },
      error: (e: any) => {
        this.savingSchedule.set(false);
        this.scheduleError.set(e.message ?? 'Could not save schedule');
      },
    });
  }
}
