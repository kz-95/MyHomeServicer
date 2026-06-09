import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  computed,
  effect,
  inject,
  signal,
  ElementRef,
  viewChild,
  SecurityContext,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink, NavigationEnd } from "@angular/router";
import { DomSanitizer } from "@angular/platform-browser";
import { Subscription, filter, firstValueFrom } from "rxjs";
import { AuthService } from "../core/services/auth.service";
import { ApiService } from "../core/services/api.service";
import { SocketService } from "../core/services/socket.service";
import {
  ChatWidgetService,
  PrefillData,
} from "../core/services/chat-widget.service";
import { PinService } from "../core/services/pin.service";
import { QuoteAssistBridge } from "../core/services/quote-assist-bridge.service";
import {
  PlacesAutocompleteComponent,
  PlaceResult,
} from "./places-autocomplete.component";
import { ChatQaService } from "./chat-qa.service";
import { QaHost, QaBlock, QaAnswer } from "./chat-qa-harness";
import { QaFormBridge } from "./qa-form-bridge.service";
import { environment } from "../../environments/environment";

/** PIN that unlocks the dev-only automated chat QA run. */
const QA_PIN = "5201314";

/** Supported card languages. Cards mirror the language the customer is writing in. */
type CardLang = "en" | "ms" | "zh" | "ta";

/**
 * Detect the language of a chunk of user text. Tamil and Chinese scripts win on sight;
 * otherwise a few distinctive Malay markers flip it to Malay; default English. This
 * resolves rojak (mixed) to its non-English side — Tamil/Chinese/Malay-laced rojak maps
 * to ta/zh/ms — instead of always falling back to English.
 */
function detectCardLang(text: string): CardLang {
  if (/[஀-௿]/.test(text)) return "ta";
  if (/[一-鿿]/.test(text)) return "zh";
  if (
    /\b(saya|nak|perlu|rumah|bocor|esok|pagi|petang|malam|kotor|sangat|betul|boleh|tolong|bajet|pukul|sejuk|rosak|tersumbat|berapa|nombor|alamat)\b/i.test(
      text,
    )
  )
    return "ms";
  return "en";
}

/** Card UI strings per language. `en` is the source of truth; ms/zh/ta mirror it. */
const CARD_T: Record<string, Record<CardLang, string>> = {
  confirm: { en: "Confirm", ms: "Sahkan", zh: "确认", ta: "உறுதிப்படுத்து" },
  yesThatsIt: { en: "Yes, that's it", ms: "Ya, betul", zh: "对，就是这个", ta: "ஆம், அதுதான்" },
  notThisService: { en: "Not this service", ms: "Bukan servis ini", zh: "不是这个服务", ta: "இந்த சேவை அல்ல" },
  notThisOne: { en: "Not this one", ms: "Bukan yang ini", zh: "不是这个", ta: "இது அல்ல" },
  isThisService: { en: "Is this the service you need?", ms: "Ini servis yang anda perlukan?", zh: "这是您需要的服务吗？", ta: "உங்களுக்குத் தேவையான சேவை இதுவா?" },
  selected: { en: "Selected", ms: "Dipilih", zh: "已选择", ta: "தேர்ந்தெடுக்கப்பட்டது" },
  changeLater: { en: "You can change it later if needed.", ms: "Anda boleh ubah kemudian jika perlu.", zh: "如有需要，稍后可更改。", ta: "தேவைப்பட்டால் பின்னர் மாற்றலாம்." },
  typeStar: { en: "Type*", ms: "Jenis*", zh: "类型*", ta: "வகை*" },
  landed: { en: "Landed", ms: "Teres / Banglo", zh: "独立式", ta: "தனி வீடு" },
  condo: { en: "Condo", ms: "Kondo", zh: "公寓", ta: "கொண்டோ" },
  commercial: { en: "Commercial", ms: "Komersial", zh: "商用", ta: "வணிக" },
  selectBuildingType: { en: "Select building type…", ms: "Pilih jenis bangunan…", zh: "选择建筑类型…", ta: "கட்டிட வகையைத் தேர்ந்தெடுக்கவும்…" },
  noUnit: { en: "No. / Unit", ms: "No. / Unit", zh: "门牌 / 单位", ta: "எண் / யூனிட்" },
  streetPlaceholder: { en: "Street (type and pick from the list)", ms: "Jalan (taip dan pilih dari senarai)", zh: "街道（输入并从列表选择）", ta: "தெரு (தட்டச்சு செய்து பட்டியலில் தேர்வு)" },
  postcode: { en: "Postcode", ms: "Poskod", zh: "邮编", ta: "அஞ்சல் குறியீடு" },
  postcode5: { en: "Postcode must be exactly 5 digits (e.g. 47100).", ms: "Poskod mesti tepat 5 digit (cth. 47100).", zh: "邮编必须是5位数字（例如 47100）。", ta: "அஞ்சல் குறியீடு சரியாக 5 இலக்கங்கள் இருக்க வேண்டும் (எ.கா. 47100)." },
  findingLocation: { en: "Finding your location…", ms: "Mencari lokasi anda…", zh: "正在定位…", ta: "உங்கள் இருப்பிடத்தைக் கண்டறிகிறது…" },
  verifyingAddress: { en: "Verifying address…", ms: "Mengesahkan alamat…", zh: "正在验证地址…", ta: "முகவரியைச் சரிபார்க்கிறது…" },
  enterStreetPostcode: { en: "⚠️ Enter a street and a 5-digit postcode.", ms: "⚠️ Masukkan jalan dan poskod 5 digit.", zh: "⚠️ 请输入街道和5位邮编。", ta: "⚠️ தெரு மற்றும் 5 இலக்க அஞ்சல் குறியீட்டை உள்ளிடவும்." },
  enterStreet: { en: "⚠️ Enter a street from the dropdown above.", ms: "⚠️ Pilih jalan dari senarai di atas.", zh: "⚠️ 请从上方列表选择街道。", ta: "⚠️ மேலே உள்ள பட்டியலில் தெருவைத் தேர்ந்தெடுக்கவும்." },
  enterPostcode: { en: "⚠️ Enter a valid 5-digit postcode (e.g. 47100).", ms: "⚠️ Masukkan poskod 5 digit yang sah (cth. 47100).", zh: "⚠️ 请输入有效的5位邮编（例如 47100）。", ta: "⚠️ சரியான 5 இலக்க அஞ்சல் குறியீட்டை உள்ளிடவும் (எ.கா. 47100)." },
  enterNoType: { en: "⚠️ Enter the unit No. and pick a property type.", ms: "⚠️ Masukkan No. unit dan pilih jenis hartanah.", zh: "⚠️ 请输入门牌号并选择房产类型。", ta: "⚠️ யூனிட் எண்ணை உள்ளிட்டு சொத்து வகையைத் தேர்ந்தெடுக்கவும்." },
  validPhone: { en: "Enter a valid phone number.", ms: "Masukkan nombor telefon yang sah.", zh: "请输入有效的电话号码。", ta: "சரியான தொலைபேசி எண்ணை உள்ளிடவும்." },
  allCollected: { en: "All information collected", ms: "Semua maklumat lengkap", zh: "所有资料已收集", ta: "அனைத்து தகவல்களும் சேகரிக்கப்பட்டன" },
  reviewSubmitNote: { en: "Review above and submit your quote request.", ms: "Semak di atas dan hantar permintaan sebut harga anda.", zh: "请检查以上信息并提交您的报价请求。", ta: "மேலே உள்ளதைச் சரிபார்த்து உங்கள் கோரிக்கையைச் சமர்ப்பிக்கவும்." },
  reviewSubmit: { en: "Review & submit", ms: "Semak & hantar", zh: "检查并提交", ta: "சரிபார்த்து சமர்ப்பி" },
  yesItsMe: { en: "Yes, it's me", ms: "Ya, ini saya", zh: "是的，是我", ta: "ஆம், நான்தான்" },
  notMe: { en: "No, not me", ms: "Bukan, bukan saya", zh: "不，不是我", ta: "இல்லை, நான் அல்ல" },
  confirmedTick: { en: "✅ Confirmed", ms: "✅ Disahkan", zh: "✅ 已确认", ta: "✅ உறுதிப்படுத்தப்பட்டது" },
  startingFresh: { en: "Starting fresh", ms: "Mula semula", zh: "重新开始", ta: "புதிதாகத் தொடங்குகிறது" },
  // Time slots
  tmorning: { en: "🌅 Morning (9:00–11:00)", ms: "🌅 Pagi (9:00–11:00)", zh: "🌅 早上 (9:00–11:00)", ta: "🌅 காலை (9:00–11:00)" },
  tnoon: { en: "☀️ Noon (11:00–13:00)", ms: "☀️ Tengah hari (11:00–13:00)", zh: "☀️ 中午 (11:00–13:00)", ta: "☀️ நண்பகல் (11:00–13:00)" },
  tafternoon: { en: "🌆 Afternoon (13:00–15:00)", ms: "🌆 Petang (13:00–15:00)", zh: "🌆 下午 (13:00–15:00)", ta: "🌆 பிற்பகல் (13:00–15:00)" },
  tevening: { en: "🌙 Evening (15:00–17:00)", ms: "🌙 Lewat petang (15:00–17:00)", zh: "🌙 傍晚 (15:00–17:00)", ta: "🌙 மாலை (15:00–17:00)" },
  tnight: { en: "🌃 Night (17:00–22:00)", ms: "🌃 Malam (17:00–22:00)", zh: "🌃 晚上 (17:00–22:00)", ta: "🌃 இரவு (17:00–22:00)" },
  // Field labels
  contactName: { en: "Your name", ms: "Nama anda", zh: "您的姓名", ta: "உங்கள் பெயர்" },
  contactNumber: { en: "Phone number", ms: "Nombor telefon", zh: "电话号码", ta: "தொலைபேசி எண்" },
  address: { en: "Address", ms: "Alamat", zh: "地址", ta: "முகவரி" },
  preferredDate: { en: "Preferred date", ms: "Tarikh pilihan", zh: "首选日期", ta: "விரும்பிய தேதி" },
  timeSlot: { en: "Preferred time", ms: "Masa pilihan", zh: "首选时间", ta: "விரும்பிய நேரம்" },
  notes: { en: "Notes", ms: "Nota", zh: "备注", ta: "குறிப்புகள்" },
  budgetMin: { en: "Min budget", ms: "Bajet minimum", zh: "最低预算", ta: "குறைந்தபட்ச பட்ஜெட்" },
  budgetMax: { en: "Max budget", ms: "Bajet maksimum", zh: "最高预算", ta: "அதிகபட்ச பட்ஜெட்" },
  propertyType: { en: "Property type", ms: "Jenis hartanah", zh: "房产类型", ta: "சொத்து வகை" },
  service: { en: "Service", ms: "Perkhidmatan", zh: "服务", ta: "சேவை" },
  svcReject: { en: "Not this service", ms: "Bukan perkhidmatan ini", zh: "不是这个服务", ta: "இந்த சேவை அல்ல" },
  // Summary labels
  sDate: { en: "Date", ms: "Tarikh", zh: "日期", ta: "தேதி" },
  sTime: { en: "Time", ms: "Masa", zh: "时间", ta: "நேரம்" },
  sAddress: { en: "Address", ms: "Alamat", zh: "地址", ta: "முகவரி" },
  sName: { en: "Name", ms: "Nama", zh: "姓名", ta: "பெயர்" },
  sPhone: { en: "Phone", ms: "Telefon", zh: "电话", ta: "தொலைபேசி" },
  sNotes: { en: "Notes", ms: "Nota", zh: "备注", ta: "குறிப்புகள்" },
  sBudget: { en: "Budget", ms: "Bajet", zh: "预算", ta: "பட்ஜெட்" },
};

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  actions?: { action: string; label: string }[];
  actionBlocks?: Array<{ type: string; data: Record<string, unknown> }>;
}

// Automated chat-QA lives in chat-qa-harness.ts (pure scenario engine) + chat-qa.service.ts
// (shared runner). This component only supplies the QaHost adapter (buildQaHost) that
// maps the harness's card actions onto the real card handlers + signals below.

interface PublicConfig {
  chatGuestAutoOpen?: boolean;
  chatGuestAutoOpenDelay?: number;
  chatGreetings?: string[];
  chatGreetingsReturning?: string[];
  chatGreetingsCustomer?: string[];
  chatGreetingsServicer?: string[];
  chatGreetingsAdmin?: string[];
}

@Component({
  selector: "app-chat-widget",
  imports: [FormsModule, RouterLink, PlacesAutocompleteComponent],
  template: `
    @if (!widget.isOpen() && showGuestFab()) {
      <button
        class="cw-fab"
        (click)="widget.open()"
        [class.has-unread]="widget.chatUnread() > 0"
        aria-label="Open help chat"
        title="Help chat"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <span
          class="cw-fab-dot"
          [class.online]="widget.chatStatus() !== 'offline'"
          [class.blink]="widget.chatStatus() === 'active'"
        ></span>
        @if (widget.chatUnread() > 0) {
          <span class="cw-fab-unread">{{
            widget.chatUnread() > 99 ? "99+" : widget.chatUnread()
          }}</span>
        }
      </button>
    }
    @if (widget.isOpen()) {
      <div class="backdrop" (click)="widget.close()"></div>
      <div class="panel" role="dialog" aria-label="Help chat">
        <div class="panel-header">
          <div class="panel-id">
            <div class="avatar" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                />
              </svg>
            </div>
            <div>
              <strong>Help Assistant</strong>
              <span class="status">
                <span
                  class="status-dot"
                  [class.online]="widget.chatStatus() !== 'offline'"
                  [class.blink]="widget.chatStatus() === 'active'"
                ></span>
                {{ auth.principal() ? statusLabel() : "Online" }}
              </span>
            </div>
          </div>
          <div class="header-acts">
            @if (qaVisible) {
              <button
                class="clear-btn qa-btn"
                (click)="onQaPress()"
                [class.running]="qa.running()"
                [title]="qa.running() ? qa.status() : 'Automated chat QA (dev only)'"
              >
                {{ qa.running() ? "Stop QA" : "QA" }}
              </button>
            }
            <button
              class="clear-btn"
              (click)="clear()"
              [disabled]="clearing() || qa.running() || messages().length === 0"
            >
              {{ clearing() ? "…" : "Clear" }}
            </button>
            <button
              class="close-btn"
              (click)="widget.close()"
              aria-label="Close chat"
            >
              &times;
            </button>
          </div>
        </div>

        @if (qaVisible && (qaPanelOpen() || qa.running())) {
          <div class="qa-panel">
            @if (qa.running()) {
              <span class="qa-status">{{ qa.status() || "Running QA…" }}</span>
              <button class="qa-go" (click)="qa.cancel()">Stop</button>
            } @else {
              <input
                type="password"
                class="qa-pin"
                placeholder="QA PIN"
                [ngModel]="qaPin()"
                (ngModelChange)="qaPin.set($event)"
                aria-label="QA PIN"
              />
              <input
                type="number"
                class="qa-runs"
                min="1"
                max="500"
                [ngModel]="qaRuns()"
                (ngModelChange)="setQaRuns($event)"
                title="Number of runs (each = one full quote)"
                aria-label="QA run count"
              />
              <button class="qa-go" (click)="startQa()">Run</button>
              @if (qa.status()) { <span class="qa-status">{{ qa.status() }}</span> }
            }
          </div>
        }

        @if (!auth.principal()) {
          <div class="guest-banner">
            <span
              >Guest chat isn't saved.
              <a
                routerLink="/login"
                [queryParams]="{ intent: 'chat' }"
                (click)="widget.close()"
                >Sign in</a
              >
              for help tied to your account.</span
            >
          </div>
        }

        <div class="thread" #threadEl (click)="handleThreadClick($event)">
          @if (initError()) {
            <p class="err-msg">{{ initError() }}</p>
          }
          @for (m of messages(); track $index; let mi = $index) {
            <div class="msg" [class.user]="m.role === 'user'">
              @if (m.role === "assistant") {
                @if (m.content) {
                  <span
                    class="bubble"
                    [innerHTML]="formatMessage(m.content)"
                  ></span>
                }
              } @else {
                <span class="bubble">{{ m.content }}</span>
              }
              @if (m.actions; as acts) {
                <div class="action-row">
                  @for (a of acts; track a.action) {
                    <button class="action-btn" (click)="runAction(a.action)">
                      {{ a.label }}
                    </button>
                  }
                </div>
              }
              @if (m.role === "assistant" && m.actionBlocks; as blocks) {
                <div class="action-blocks">
                  @for (b of blocks; track $index) {
                    <div class="action-card">
                      @switch (b.type) {
                        @case ("quote_options") {
                          <div class="ac-quote-options">
                            <div class="ac-icon">🔧</div>
                            <strong>{{
                              getStr(b.data, "category") || "Service"
                            }}</strong>
                            @if (cardResolved(getStr(b.data, "categoryId"))) {
                              @if (
                                confirmedCategoryId() ===
                                getStr(b.data, "categoryId")
                              ) {
                                <p class="field-confirmed-value">✅ {{ t('selected') }}</p>
                              } @else {
                                <p class="muted">{{ t('notThisOne') }}</p>
                              }
                            } @else {
                              <p class="muted">{{ t('isThisService') }}</p>
                              <div class="ac-actions">
                                <button
                                  class="btn-primary"
                                  (click)="continueQuoteInChat(b.data)"
                                >
                                  {{ t('yesThatsIt') }}
                                </button>
                                <button
                                  class="btn-outline"
                                  (click)="rejectCategory(b.data)"
                                >
                                  {{ t('notThisService') }}
                                </button>
                              </div>
                            }
                          </div>
                        }
                        @case ("quote_field") {
                          <div class="ac-quote-field">
                            <label>{{
                              fieldLabel(
                                getStr(b.data, "key") || getStr(b.data, "label")
                              )
                            }}</label>
                            @if (getStr(b.data, "key") === "preferredDate") {
                              @if (dateConfirmed()) {
                                <div class="field-confirmed">
                                  <span class="field-confirmed-value"
                                    >✅ {{ dateConfirmed() }}</span
                                  >
                                  <span class="field-confirmed-note"
                                    >{{ t('changeLater') }}</span
                                  >
                                </div>
                              } @else {
                                <input
                                  type="date"
                                  [ngModel]="prefillDate()"
                                  (ngModelChange)="onDateSelected($event)"
                                  name="pf_date"
                                />
                                <button
                                  type="button"
                                  class="btn-primary ac-confirm"
                                  [disabled]="!prefillDate()"
                                  (click)="confirmDate()"
                                >
                                  {{ t('confirm') }}
                                </button>
                              }
                            } @else if (getStr(b.data, "key") === "timeSlot") {
                              @if (timeConfirmed()) {
                                <div class="field-confirmed">
                                  <span class="field-confirmed-value"
                                    >✅ {{ timeConfirmedLabel() }}</span
                                  >
                                  <span class="field-confirmed-note"
                                    >{{ t('changeLater') }}</span
                                  >
                                </div>
                              } @else {
                                <div class="time-options">
                                  @for (
                                    opt of timeSlotOptions;
                                    track opt.value
                                  ) {
                                    <button
                                      type="button"
                                      class="time-btn"
                                      [class.selected]="
                                        prefillTimeSlot() === opt.value
                                      "
                                      (click)="onTimeSlotSelected(opt.value)"
                                    >
                                      {{ tSlot(opt.value) }}
                                    </button>
                                  }
                                </div>
                                <button
                                  type="button"
                                  class="btn-primary ac-confirm"
                                  [disabled]="!prefillTimeSlot()"
                                  (click)="confirmTime()"
                                >
                                  {{ t('confirm') }}
                                </button>
                              }
                            } @else if (getStr(b.data, "key") === "address") {
                              @if (addressConfirmed()) {
                                <div class="field-confirmed">
                                  <span class="field-confirmed-value"
                                    >✅
                                    {{
                                      addressFormatted() || composedAddress()
                                    }}</span
                                  >
                                  <span class="field-confirmed-note"
                                    >{{ t('changeLater') }}</span
                                  >
                                </div>
                              } @else {
                                <div class="addr-fields">
                                  <div class="addr-row">
                                    <input
                                      class="addr-no"
                                      type="text"
                                      [ngModel]="addrNo()"
                                      (ngModelChange)="addrNo.set($event)"
                                      name="pf_addr_no"
                                      [placeholder]="t('noUnit')"
                                    />
                                    <select
                                      class="ptype-select"
                                      [ngModel]="addrPropertyType()"
                                      (ngModelChange)="
                                        addrPropertyType.set($event)
                                      "
                                    >
                                      <option value="">{{ t('typeStar') }}</option>
                                      <option value="landed">{{ t('landed') }}</option>
                                      <option value="condo">{{ t('condo') }}</option>
                                      <option value="commercial">
                                        {{ t('commercial') }}
                                      </option>
                                    </select>
                                    <button
                                      type="button"
                                      class="gps-btn"
                                      [disabled]="locatingGps()"
                                      (click)="locateViaGps()"
                                      title="Use my current location"
                                    >
                                      📍
                                    </button>
                                  </div>
                                  <app-places-autocomplete
                                    [types]="['address']"
                                    [placeholder]="t('streetPlaceholder')"
                                    (placeSelect)="onChatPlaceSelect($event)"
                                  ></app-places-autocomplete>
                                  <input
                                    class="addr-postcode"
                                    type="text"
                                    [ngModel]="addrPostcode()"
                                    (ngModelChange)="addrPostcode.set($event)"
                                    name="pf_addr_postcode"
                                    [placeholder]="t('postcode')"
                                    maxlength="5"
                                    pattern="[0-9]{5}"
                                    inputmode="numeric"
                                  />
                                  @if (addrPostcode().length === 5 && !postcodeValid()) {
                                    <span class="addr-invalid">{{ t('postcode5') }}</span>
                                  }
                                  @if (addrStreet()) {
                                    <span class="addr-valid"
                                      >✓ {{ addrStreet() }}</span
                                    >
                                  }
                                  @if (locatingGps()) {
                                    <span class="addr-validating"
                                      >{{ t('findingLocation') }}</span
                                    >
                                  } @else if (addrValidating()) {
                                    <span class="addr-validating"
                                      >{{ t('verifyingAddress') }}</span
                                    >
                                  } @else if (addrError()) {
                                    <span class="addr-invalid">{{
                                      addrError()
                                    }}</span>
                                  }
                                </div>
                                @if (!addrNo().trim() || !addrStreet().trim() || !postcodeValid() || !addrPropertyType()) {
                                  <p class="addr-reminder">
                                    @if (!addrNo().trim() || !addrPropertyType()) {
                                      {{ t('enterNoType') }}
                                    } @else if (!addrStreet().trim() && !postcodeValid()) {
                                      {{ t('enterStreetPostcode') }}
                                    } @else if (!addrStreet().trim()) {
                                      {{ t('enterStreet') }}
                                    } @else if (!postcodeValid()) {
                                      {{ t('enterPostcode') }}
                                    }
                                  </p>
                                }
                                <button
                                  type="button"
                                  class="btn-primary ac-confirm"
                                  [disabled]="
                                    !addrNo().trim() ||
                                    !addrPropertyType() ||
                                    !addrStreet().trim() ||
                                    !postcodeValid() ||
                                    addrValidating() ||
                                    locatingGps()
                                  "
                                  (click)="confirmAddress()"
                                >
                                  {{ t('confirm') }}
                                </button>
                              }
                            } @else if (
                              getStr(b.data, "key") === "propertyType"
                            ) {
                              @if (valueCollected("propertyType")) {
                                <div class="field-confirmed">
                                  <span class="field-confirmed-value"
                                    >✅
                                    {{
                                      widget.prefillData()["propertyType"]
                                    }}</span
                                  >
                                </div>
                              } @else {
                                <div class="ac-budget">
                                  <select
                                    [ngModel]="addrPropertyType()"
                                    (ngModelChange)="
                                      addrPropertyType.set($event)
                                    "
                                    name="pf_property_type"
                                  >
                                    <option value="">
                                      {{ t('selectBuildingType') }}
                                    </option>
                                    <option value="landed">{{ t('landed') }}</option>
                                    <option value="condo">{{ t('condo') }}</option>
                                    <option value="commercial">
                                      {{ t('commercial') }}
                                    </option>
                                  </select>
                                  <button
                                    type="button"
                                    class="btn-primary ac-confirm"
                                    [disabled]="!addrPropertyType()"
                                    (click)="confirmPropertyType()"
                                  >
                                    {{ t('confirm') }}
                                  </button>
                                </div>
                              }
                            } @else if (
                              getStr(b.data, "key") === "contactNumber"
                            ) {
                              @if (valueCollected("contactNumber")) {
                                <div class="field-confirmed">
                                  <span class="field-confirmed-value"
                                    >✅
                                    {{
                                      widget.prefillData()["contactNumber"]
                                    }}</span
                                  >
                                </div>
                              } @else {
                                <div class="phone-row">
                                  <select
                                    class="phone-prefix"
                                    [ngModel]="phonePrefix()"
                                    (ngModelChange)="phonePrefix.set($event)"
                                    name="pf_cprefix"
                                  >
                                    @for (c of phonePrefixes; track c.code) {
                                      <option [value]="c.code">
                                        {{ c.label }}
                                      </option>
                                    }
                                  </select>
                                  <input
                                    type="tel"
                                    inputmode="tel"
                                    [ngModel]="contactPhoneLocal()"
                                    (ngModelChange)="
                                      contactPhoneLocal.set($event)
                                    "
                                    name="pf_cphone"
                                    placeholder="12 345 6789"
                                  />
                                </div>
                                @if (contactPhoneLocal() && !phoneValid()) {
                                  <span class="addr-invalid"
                                    >{{ t('validPhone') }}</span
                                  >
                                }
                                <button
                                  type="button"
                                  class="btn-primary ac-confirm"
                                  [disabled]="!phoneValid()"
                                  (click)="confirmPhone()"
                                >
                                  {{ t('confirm') }}
                                </button>
                              }
                            } @else if (
                              (getStr(b.data, "key") === "budgetMax" ||
                                getStr(b.data, "key") === "budgetMin") &&
                              budgetRanges().length > 0
                            ) {
                              <div class="ac-budget">
                                @if (budgetAnswered()) {
                                  <div class="field-confirmed">
                                    <span class="field-confirmed-value"
                                      >✅
                                      {{
                                        rangeLabel(
                                          budgetRanges()[budgetSliderIdx()]
                                        )
                                      }}</span
                                    >
                                  </div>
                                } @else {
                                  <input
                                    type="range"
                                    class="budget-range"
                                    [min]="0"
                                    [max]="budgetRanges().length - 1"
                                    [step]="1"
                                    [ngModel]="budgetSliderIdx()"
                                    (ngModelChange)="onBudgetSlide($event)"
                                    name="pf_budget"
                                  />
                                  <div class="budget-ticks">
                                    @for (r of budgetRanges(); track $index) {
                                      <span
                                        class="budget-tick"
                                        [class.on]="
                                          budgetSliderIdx() === $index
                                        "
                                        >{{ rangeLabel(r) }}</span
                                      >
                                    }
                                  </div>
                                  <button
                                    type="button"
                                    class="btn-primary ac-budget-confirm"
                                    (click)="confirmBudget()"
                                  >
                                    {{ t('confirm') }}
                                    {{
                                      rangeLabel(
                                        budgetRanges()[budgetSliderIdx()]
                                      )
                                    }}
                                  </button>
                                }
                              </div>
                            } @else {
                              @if (
                                confirmedTextValues()[getStr(b.data, "key")]
                              ) {
                                <div class="field-confirmed">
                                  <span class="field-confirmed-value"
                                    >✅
                                    {{
                                      confirmedTextValues()[
                                        getStr(b.data, "key")
                                      ]
                                    }}</span
                                  >
                                </div>
                              } @else {
                                <input
                                  type="text"
                                  [ngModel]="prefillText()"
                                  (ngModelChange)="
                                    onPrefillField(
                                      getStr(b.data, 'key'),
                                      $event
                                    )
                                  "
                                  name="pf_text"
                                  placeholder="Enter {{
                                    fieldLabel(
                                      getStr(b.data, 'key') ||
                                        getStr(b.data, 'label')
                                    )
                                  }}"
                                />
                                <button
                                  type="button"
                                  class="btn-primary ac-confirm"
                                  [disabled]="!prefillText().trim()"
                                  (click)="confirmText(getStr(b.data, 'key'))"
                                >
                                  {{ t('confirm') }}
                                </button>
                              }
                            }
                          </div>
                        }
                        @case ("quote_question") {
                          <div class="ac-quote-field">
                            <label
                              >{{ getStr(b.data, "label") }}
                              @if (getBool(b.data, "required")) {
                                <span class="req">*</span>
                              }
                            </label>
                            @if (getStr(b.data, "description")) {
                              <p class="muted q-desc">
                                {{ getStr(b.data, "description") }}
                              </p>
                            }
                            @if (questionAnswered(getStr(b.data, "key"))) {
                              <div class="field-confirmed">
                                <span class="field-confirmed-value"
                                  >✅ {{ answerDisplay(b.data) }}</span
                                >
                              </div>
                            } @else {
                              @switch (getStr(b.data, "qtype")) {
                                @case ("radio") {
                                  <div class="time-options">
                                    @for (
                                      o of getOptions(b.data);
                                      track o.value
                                    ) {
                                      <button
                                        type="button"
                                        class="time-btn"
                                        (click)="answerRadio(b.data, o.value)"
                                      >
                                        {{ o.label }}
                                      </button>
                                    }
                                  </div>
                                }
                                @case ("checkbox") {
                                  <div class="time-options">
                                    @for (
                                      o of getOptions(b.data);
                                      track o.value
                                    ) {
                                      <button
                                        type="button"
                                        class="time-btn"
                                        [class.selected]="
                                          qCheckbox().includes(o.value)
                                        "
                                        (click)="toggleQCheckbox(o.value)"
                                      >
                                        {{ o.label }}
                                      </button>
                                    }
                                  </div>
                                  <button
                                    type="button"
                                    class="btn-primary ac-confirm"
                                    [disabled]="qCheckbox().length === 0"
                                    (click)="confirmQCheckbox(b.data)"
                                  >
                                    {{ t('confirm') }}
                                  </button>
                                }
                                @case ("number") {
                                  <input
                                    type="number"
                                    min="0"
                                    [ngModel]="qNumber()"
                                    (ngModelChange)="qNumber.set($event)"
                                    name="q_num"
                                  />
                                  <button
                                    type="button"
                                    class="btn-primary ac-confirm"
                                    [disabled]="
                                      qNumber() === null || qNumber()! < 0
                                    "
                                    (click)="confirmQNumber(b.data)"
                                  >
                                    {{ t('confirm') }}
                                  </button>
                                }
                                @case ("quantity") {
                                  <div class="qty-list">
                                    @for (
                                      o of getOptions(b.data);
                                      track o.value
                                    ) {
                                      <div class="qty-row">
                                        <span class="qty-label">{{
                                          o.label
                                        }}</span>
                                        <div class="qty-stepper">
                                          <button
                                            type="button"
                                            class="qty-btn"
                                            (click)="decQ(o.value)"
                                          >
                                            −
                                          </button>
                                          <span class="qty-val">{{
                                            qQuantity()[o.value] ?? 0
                                          }}</span>
                                          <button
                                            type="button"
                                            class="qty-btn"
                                            (click)="incQ(o.value)"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    }
                                  </div>
                                  <button
                                    type="button"
                                    class="btn-primary ac-confirm"
                                    [disabled]="qQuantityTotal() === 0"
                                    (click)="confirmQQuantity(b.data)"
                                  >
                                    {{ t('confirm') }}
                                  </button>
                                }
                                @default {
                                  <input
                                    type="text"
                                    [ngModel]="qText()"
                                    (ngModelChange)="qText.set($event)"
                                    name="q_text"
                                    placeholder="Your answer"
                                  />
                                  <button
                                    type="button"
                                    class="btn-primary ac-confirm"
                                    [disabled]="!qText().trim()"
                                    (click)="confirmQText(b.data)"
                                  >
                                    {{ t('confirm') }}
                                  </button>
                                }
                              }
                            }
                          </div>
                        }
                        @case ("quote_prefill") {
                          @if (mi === messages().length - 1) {
                            <div class="ac-quote-prefill">
                              <div class="ac-icon">✅</div>
                              <strong>{{ t('allCollected') }}</strong>
                              <div class="prefill-summary">
                                @for (
                                  item of prefillSummary();
                                  track item.label
                                ) {
                                  <div class="prefill-row">
                                    <span class="prefill-label">{{
                                      item.label
                                    }}</span>
                                    <span class="prefill-value">{{
                                      item.value
                                    }}</span>
                                  </div>
                                }
                              </div>
                               <p class="muted">
                                 {{ t('reviewSubmitNote') }}
                               </p>
                               <button
                                class="btn-primary"
                                (click)="submitPrefill()"
                              >
                                {{ t('reviewSubmit') }}
                              </button>
                            </div>
                          }
                        }
                        @case ("profile_field") {
                          <div class="ac-profile-field">
                            <div class="ac-icon">🏢</div>
                            <strong>{{
                              getStr(b.data, "label") || "Field"
                            }}</strong>
                            <p class="muted">
                              {{ getStr(b.data, "value") || "(not set)" }}
                            </p>
                            @if (b.data["required"] === true) {
                              <span class="req-badge">Required</span>
                            }
                            <button
                              class="btn-outline"
                              (click)="editProfileField(b.data)"
                            >
                              Edit with PIN 🔒
                            </button>
                          </div>
                        }
                        @case ("pin_required") {
                          <div class="ac-pin-warning">
                            <div class="ac-icon">🔒</div>
                            <p>You'll need your PIN for this action.</p>
                          </div>
                        }
                        @case ("link") {
                          <div class="ac-link">
                            <button
                              class="btn-outline"
                              (click)="navigateAction(getStr(b.data, 'href'))"
                            >
                              {{ getStr(b.data, "label") || "Open" }}
                            </button>
                          </div>
                        }
                        @case ("retry") {
                          @if (
                            mi === messages().length - 1 && retryCount() < 3
                          ) {
                            <div class="ac-link">
                              <button
                                class="btn-primary"
                                [disabled]="sending() || connecting()"
                                (click)="retryLastMessage()"
                              >
                                {{ getStr(b.data, "label") || "Try again" }}
                              </button>
                            </div>
                          }
                        }
                        @case ("identity_confirm") {
                          <div class="ac-link">
                            @if (identityConfirmed() === null) {
                              <button
                                class="btn-primary"
                                (click)="confirmIdentity(true)"
                              >
                                {{ t('yesItsMe') }}
                              </button>
                              <button
                                class="btn-outline"
                                (click)="confirmIdentity(false)"
                              >
                                {{ t('notMe') }}
                              </button>
                            } @else {
                              <span class="muted" style="font-size:0.82rem">{{
                                identityConfirmed()
                                  ? t('confirmedTick')
                                  : t('startingFresh')
                              }}</span>
                            }
                          </div>
                        }
                      }
                    </div>
                  }
                </div>
              }
              @if (m.createdAt) {
                <span class="time">{{ formatTime(m.createdAt) }}</span>
              }
            </div>
          } @empty {
            <div class="empty">
              <p class="muted">
                {{
                  auth.principal()
                    ? "Ask me anything about quotes, bookings, payments, or reorders."
                    : "Write a note or draft a message."
                }}
              </p>
            </div>
          }
          @if (sending()) {
            <div class="msg" role="status" aria-label="Assistant is typing">
              <span class="bubble typing">
                <span class="dot"></span><span class="dot"></span
                ><span class="dot"></span>
              </span>
            </div>
          }
        </div>

        <form class="composer" (ngSubmit)="sendTyped()">
          <input
            [(ngModel)]="draft"
            name="draft"
            placeholder="{{
              connecting()
                ? 'Connecting…'
                : forceCardInput()
                  ? 'Fill the address form above…'
                  : auth.principal()
                    ? 'Type a message…'
                    : 'Write a note…'
            }}"
            [disabled]="connecting() || forceCardInput()"
            aria-label="Message input"
          />
          <button
            class="btn-primary send-btn"
            type="submit"
            [disabled]="sending() || connecting() || forceCardInput() || !draft.trim()"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    }
  `,
  styles: [
    `
      /* Global floating launcher (guests on non-home pages; see showGuestFab). */
      .cw-fab {
        position: fixed;
        bottom: 1.5rem;
        right: 1.5rem;
        z-index: 997;
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 50%;
        background: var(--color-primary);
        color: #fff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.25));
        transition:
          transform 0.15s ease,
          background 0.15s ease;
      }
      .cw-fab:hover {
        background: var(--color-primary-dark);
        transform: translateY(-2px);
      }
      .cw-fab-dot {
        position: absolute;
        top: 0.45rem;
        right: 0.45rem;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--color-muted);
        border: 2px solid var(--color-primary);
      }
      .cw-fab-dot.online {
        background: var(--color-success);
      }
      .cw-fab-dot.blink {
        animation: statusPulse 1.6s ease-in-out infinite;
      }
      .cw-fab-unread {
        position: absolute;
        top: -0.2rem;
        left: -0.2rem;
        min-width: 1.1rem;
        height: 1.1rem;
        padding: 0 0.25rem;
        border-radius: 999px;
        background: var(--color-danger);
        color: #fff;
        font-size: 0.65rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      @media (max-width: 640px) {
        .cw-fab {
          bottom: 1rem;
          right: 1rem;
        }
      }

      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 998;
        animation: bd-fade 0.2s ease-out;
      }
      @keyframes bd-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .panel {
        position: fixed;
        bottom: 1.5rem;
        right: 1.5rem;
        width: 480px;
        max-width: calc(100vw - 3rem);
        height: 750px;
        max-height: calc(100vh - 3rem);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
        z-index: 999;
        display: flex;
        flex-direction: column;
        animation: panel-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden;
      }
      @keyframes panel-in {
        from {
          transform: translateY(24px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border);
        flex-shrink: 0;
      }
      .panel-id {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        font-size: 0.88rem;
      }
      .panel-id strong {
        font-size: 0.93rem;
      }
      .avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--color-primary);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .status {
        font-size: 0.72rem;
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
      .status.muted {
        color: var(--color-muted);
      }
      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex: 0 0 auto;
        background: var(--color-muted);
      }
      .status-dot.online {
        background: var(--color-success);
      }
      .status-dot.blink {
        animation: statusPulse 1.6s ease-in-out infinite;
      }
      @keyframes statusPulse {
        0%,
        100% {
          opacity: 1;
          box-shadow: 0 0 0 0 rgba(74, 140, 92, 0.5);
        }
        50% {
          opacity: 0.6;
          box-shadow: 0 0 0 3px rgba(74, 140, 92, 0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .status-dot.blink {
          animation: none;
        }
      }
      .header-acts {
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
      .clear-btn {
        background: none;
        border: none;
        font-size: 0.78rem;
        color: var(--color-muted);
        cursor: pointer;
        padding: 0.2rem 0.4rem;
      }
      .clear-btn:hover {
        color: var(--color-danger);
      }
      .clear-btn:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .qa-btn {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .qa-runs {
        width: 3rem;
        font-size: 0.78rem;
        padding: 0.15rem 0.3rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        text-align: center;
      }
      .qa-panel {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.6rem;
        background: var(--color-bg);
        border-bottom: 1px solid var(--color-border);
        flex-wrap: wrap;
      }
      .qa-pin {
        width: 5rem;
        font-size: 0.78rem;
        padding: 0.2rem 0.4rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .qa-go {
        font-size: 0.78rem;
        padding: 0.2rem 0.6rem;
        background: var(--color-primary, #2563eb);
        color: #fff;
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
      }
      .qa-status {
        font-size: 0.75rem;
        color: var(--color-muted);
      }
      .qa-btn.running {
        color: #fff;
        background: var(--color-danger);
        border-color: var(--color-danger);
      }
      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 50%;
        font-size: 1.1rem;
        color: var(--color-muted);
        cursor: pointer;
        padding: 0;
        line-height: 1;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }
      .close-btn:hover {
        background: var(--color-surface);
        color: var(--color-text);
      }

      .guest-banner {
        padding: 0.5rem 1rem;
        font-size: 0.78rem;
        background: var(--color-bg);
        border-bottom: 1px solid var(--color-border);
        text-align: center;
        flex-shrink: 0;
      }
      .guest-banner a {
        color: var(--color-primary);
        font-weight: 600;
      }

      .thread {
        flex: 1;
        overflow-y: auto;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        scroll-behavior: smooth;
      }
      .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        text-align: center;
        padding: 1rem;
      }
      .empty p {
        font-size: 0.85rem;
      }

      .msg {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.15rem;
      }
      .msg.user {
        align-items: flex-end;
      }
      .time {
        font-size: 0.65rem;
        color: var(--color-muted);
        padding: 0 0.2rem;
      }
      .bubble {
        padding: 0.45rem 0.7rem;
        border-radius: 10px;
        background: var(--color-bg);
        max-width: 80%;
        line-height: 1.45;
        font-size: 0.88rem;
        word-break: break-word;
      }
      .bubble a {
        color: var(--color-primary);
        text-decoration: underline;
        font-weight: 500;
      }
      .bubble a:hover {
        color: var(--color-primary-dark);
      }
      .bubble a .ext-icon {
        font-size: 0.78em;
        margin-left: 1px;
        text-decoration: none;
        opacity: 0.85;
      }
      .msg.user .bubble {
        background: var(--color-primary);
        color: #fff;
        border-radius: 10px 10px 3px 10px;
      }
      .msg.user .bubble a {
        color: rgba(255, 255, 255, 0.9);
      }
      .msg:not(.user) .bubble {
        border: 1px solid var(--color-border);
        border-radius: 10px 10px 10px 3px;
      }

      .typing {
        display: flex;
        gap: 3px;
        padding: 0.55rem 0.7rem;
        align-items: center;
      }
      .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--color-muted);
        opacity: 0.35;
        animation: dot-bounce 1.2s infinite ease-in-out both;
      }
      .dot:nth-child(2) {
        animation-delay: 0.2s;
      }
      .dot:nth-child(3) {
        animation-delay: 0.4s;
      }
      @keyframes dot-bounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.35;
        }
        30% {
          transform: translateY(-4px);
          opacity: 1;
        }
      }

      .composer {
        display: flex;
        gap: 0.4rem;
        padding: 0.6rem 0.75rem;
        border-top: 1px solid var(--color-border);
        flex-shrink: 0;
      }
      .composer input {
        flex: 1;
        font-size: 0.88rem;
        padding: 0.9rem 0.7rem;
      }
      .send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.4rem;
        height: 2.4rem;
        padding: 0;
        border-radius: 50%;
      }

      .err-msg {
        color: var(--color-danger);
        font-size: 0.82rem;
        text-align: center;
        padding: 0.5rem;
      }

      .action-row {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-top: 0.3rem;
      }
      .action-btn {
        font-size: 0.78rem;
        padding: 0.25rem 0.5rem;
        border-radius: 6px;
      }

      .action-blocks {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.4rem;
      }
      .action-card {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.6rem;
        background: var(--color-bg);
        /* Staggered reveal: each card fades in 1.2s after the previous, so cards
           appear one by one like chat messages (delay set inline per index).
           Fill-mode both keeps the card invisible until its turn. */
        animation: cardReveal 0.35s ease both;
      }
      @keyframes cardReveal {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .action-card {
          animation-duration: 0.01ms;
          animation-delay: 0ms !important;
        }
      }
      .ac-icon {
        font-size: 1.2rem;
        margin-bottom: 0.2rem;
      }
      .ac-actions {
        display: flex;
        gap: 0.4rem;
        margin-top: 0.4rem;
      }
      .ac-actions button {
        font-size: 0.78rem;
        padding: 0.3rem 0.6rem;
      }
      .ac-quote-field label {
        font-size: 0.82rem;
        font-weight: 500;
        display: block;
        margin-bottom: 0.3rem;
      }
      .ac-quote-field input,
      .ac-quote-field select {
        width: 100%;
        font-size: 0.85rem;
        padding: 0.35rem 0.5rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
        outline: none;
      }
      /* Match the native date-picker calendar width (~Chromium 16rem) so the
         field lines up with the popup and the trigger sits close. */
      .ac-quote-field input[type="date"] {
        max-width: 16rem;
      }
      /* Budget range slider (mirrors the quote form). */
      .ac-budget {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .budget-range {
        width: 100%;
        accent-color: var(--color-primary);
        cursor: pointer;
      }
      .budget-ticks {
        display: flex;
        justify-content: space-between;
        gap: 0.2rem;
        flex-wrap: wrap;
      }
      .budget-tick {
        font-size: 0.68rem;
        color: var(--color-muted);
      }
      .budget-tick.on {
        color: var(--color-primary);
        font-weight: 700;
      }
      .ac-budget-confirm {
        align-self: flex-start;
        font-size: 0.8rem;
        padding: 0.35rem 0.7rem;
        margin-top: 0.2rem;
      }
      .ac-quote-field input:focus,
      .ac-quote-field select:focus {
        border-color: var(--color-primary);
      }
      .req-badge {
        font-size: 0.7rem;
        padding: 0.1rem 0.35rem;
        background: #fff3cd;
        color: #856404;
        border-radius: 4px;
        margin-left: 0.3rem;
      }
      .ac-pin-warning {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.6rem;
        background: #fff3cd;
        border-radius: var(--radius);
        font-size: 0.82rem;
      }
      .ac-pin-warning p {
        margin: 0;
      }
      .btn-outline {
        background: transparent;
        border: 1px solid var(--color-primary);
        color: var(--color-primary);
        padding: 0.625rem 0.7rem;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 0.82rem;
      }
      .btn-outline:hover {
        background: var(--color-primary);
        color: #fff;
      }

      .time-options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.25rem;
      }
      .q-desc {
        font-size: 0.75rem;
        margin: 0.1rem 0 0.3rem;
      }
      .qty-list {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-top: 0.25rem;
      }
      .qty-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .qty-label {
        font-size: 0.82rem;
      }
      .qty-stepper {
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
      .qty-btn {
        width: 1.6rem;
        height: 1.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
      }
      .qty-btn:hover {
        border-color: var(--color-primary);
      }
      .qty-val {
        min-width: 1.2rem;
        text-align: center;
        font-weight: 600;
        font-size: 0.85rem;
      }
      .time-btn {
        font-size: 0.78rem;
        padding: 0.3rem 0.5rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .time-btn:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .time-btn.selected {
        border-color: var(--color-primary);
        background: var(--color-primary);
        color: #fff;
      }

      .prefill-summary {
        margin: 0.5rem 0;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .prefill-row {
        display: flex;
        justify-content: space-between;
        padding: 0.3rem 0.5rem;
        font-size: 0.8rem;
        border-bottom: 1px solid var(--color-border);
      }
      .prefill-row:last-child {
        border-bottom: none;
      }
      .prefill-label {
        font-weight: 500;
        color: var(--color-muted);
      }
      .prefill-value {
        text-align: right;
        max-width: 60%;
        word-break: break-word;
      }

      .addr-validating {
        display: block;
        font-size: 0.75rem;
        color: var(--color-muted);
        margin-top: 0.2rem;
      }
      .addr-valid {
        display: block;
        font-size: 0.75rem;
        color: var(--color-success);
        margin-top: 0.2rem;
      }
      .addr-invalid {
        color: var(--color-danger);
        font-size: 0.78rem;
      }
      .addr-reminder {
        color: var(--color-warning);
        font-size: 0.78rem;
        margin: 0.15rem 0 0;
      }

      .ac-confirm {
        align-self: flex-start;
        font-size: 0.8rem;
        padding: 0.4rem 0.8rem;
        margin-top: 0.3rem;
      }
      .ac-confirm:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .addr-fields {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .addr-row {
        display: flex;
        gap: 0.35rem;
        align-items: stretch;
      }
      .addr-no {
        flex: 1;
      }
      .ptype-select {
        flex: 1;
      }
      .addr-postcode {
        width: 100%;
      }
      .gps-btn {
        flex: 0 0 auto;
        width: 2.4rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        cursor: pointer;
        font-size: 1rem;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .gps-btn:hover {
        border-color: var(--color-primary);
        background: var(--color-bg);
      }
      .gps-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .contact-prompt {
        margin: 0 0 0.4rem;
      }
      /* Stack Name then Phone vertically: the chat panel is narrow, and a 2-col
         row squeezes the phone-row (prefix select + number) so the number input
         collapses to ~0 width. Full width per field keeps the number visible. */
      .contact-fields {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .contact-col {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
      }
      .contact-label {
        font-size: 0.72rem;
        color: var(--color-muted);
      }
      .contact-col input {
        width: 100%;
        box-sizing: border-box;
      }
      .phone-row {
        display: flex;
        gap: 0.4rem;
        align-items: stretch;
      }
      .phone-prefix {
        flex: 0 0 4.5rem;
        width: 4.5rem;
        font-size: 0.82rem;
        padding: 0.35rem 0.2rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
      }
      .phone-row input {
        flex: 1 1 auto;
        width: auto;
        min-width: 0;
      }

      .field-confirmed {
        margin-bottom: 0.4rem;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      .field-confirmed-value {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-success);
      }
      .field-confirmed-note {
        font-size: 0.72rem;
        color: var(--color-muted);
        font-style: italic;
      }

      /* Mobile: the chat takes over the whole screen and a dimmed backdrop blocks
         the page behind it, so nothing in the background can be tapped while the
         chat is open (tap the backdrop, or close, to return to the page). */
      @media (max-width: 640px) {
        .backdrop {
          background: var(--color-backdrop);
        }
        .panel {
          inset: 0;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          width: auto;
          max-width: none;
          height: auto;
          max-height: none;
          border-radius: 0;
          border: none;
        }
      }
    `,
  ],
})
export class ChatWidgetComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  widget = inject(ChatWidgetService);
  auth = inject(AuthService);
  private router = inject(Router);
  private api = inject(ApiService);
  private socketSvc = inject(SocketService);
  private sanitizer = inject(DomSanitizer);
  private pin = inject(PinService);
  private assist = inject(QuoteAssistBridge);
  private qaFormBridge = inject(QaFormBridge);

  draft = "";
  sending = signal(false);
  connecting = signal(false);
  /** A message whose send() was deferred because a reply was in flight — fired once the
   *  chat goes idle (see the flush effect), so rapid card-confirms aren't dropped. */
  private pendingDraft: string | null = null;

  /**
   * The language the customer is actually conversing in, detected from their REAL
   * typed turns only (composer / suggestion tap / QA free-text) — never from a card
   * confirmation, whose text is templated English ("My budget is RM150"). Sent to the
   * backend as `lang` so replies stay pinned to it instead of flip-flopping when a
   * button click injects an English sentence. Follows a genuine switch when the user
   * actually types in another language.
   */
  readonly convoLang = signal<"en" | "ms" | "zh" | "ta" | "rojak">("en");

  /** Detect the conversation language from a free-text human message. */
  private detectLang(text: string): "en" | "ms" | "zh" | "ta" | "rojak" | null {
    if (/[一-鿿]/.test(text)) return "zh";
    if (/[஀-௿]/.test(text)) return "ta";
    const t = text.toLowerCase();
    const ms =
      /\b(saya|aku|tak|tidak|nak|hendak|boleh|rumah|macam|dengan|untuk|tolong|perlu|sangat|sudah|dah|kenapa|bocor|rosak|pasang|kipas|pintu|kunci|cuci|kereta|bilik|kotor|nombor|sila|ada|esok|kena|prlu|blh|umah)\b/.test(t);
    const en =
      /\b(the|is|are|need|want|my|i|please|can|could|help|service|fix|install|leaking|broken|book|booking|quote|today|tomorrow|name|phone|address)\b/.test(t);
    const manglish = /\b(lah|lor|leh|mah|sia|liao|anot|meh)\b/.test(t);
    if (ms && (en || manglish)) return "rojak";
    if (manglish && en) return "rojak";
    if (ms) return "ms";
    if (en) return "en";
    return null; // no language signal (bare digits, an address, a budget) — keep current
  }

  /**
   * Update the pinned conversation language from a message, STICKILY: a non-English
   * positive signal (script / Malay markers) always wins, but a Latin field value with
   * no real signal (a phone number, an address, "in the night") must NOT flip an
   * already-established ms/zh/ta/rojak conversation back to English.
   */
  private updateConvoLang(text: string): void {
    const d = this.detectLang(text);
    if (!d) return;
    if (d !== "en") {
      this.convoLang.set(d);
      return;
    }
    // English: adopt only while no non-English language has been locked yet.
    if (this.convoLang() === "en") this.convoLang.set("en");
  }

  /** Composer submit: detect the human's language, then send. */
  protected sendTyped(): void {
    const t = this.draft.trim();
    if (t) this.updateConvoLang(t);
    this.send();
  }
  clearing = signal(false);
  initError = signal("");

  /** Last resolved principal id - detects login/logout/account-switch to reset state. */
  private lastPrincipalId: string | null = null;

  /** Current route URL (kept in sync via router events) for the global FAB gate. */
  private currentUrl = signal("/");

  /**
   * Show the global floating chat button only where there isn't already one:
   * guests on any page EXCEPT home (home renders its own FAB). Logged-in users
   * always have the shell's FAB, so the global one stays hidden for them.
   */
  showGuestFab = computed(() => {
    if (this.auth.principal()) return false;
    const url = this.currentUrl();
    return url !== "/" && !url.startsWith("/?");
  });

  /** Auth-only messages - server-backed, JWT-validated, never touched in guest mode. */
  private authMsgs = signal<ChatMessage[]>([]);
  /** Guest-only messages - local-only, never populated from a logged-in account. */
  private guestMsgs = signal<ChatMessage[]>([]);
  /** Null until a JWT-backed session is live. The single source of truth for chat mode. */
  private sessionId = signal<string | null>(null);
  /**
   * The rendered buffer. Auth and guest histories live in physically separate
   * signals; this picks one by mode. While a logged-in user's session is being
   * established (connecting) we still show the auth buffer so stale guest notes
   * never flash. The instant the session is gone (logout) it falls back to the
   * guest buffer - which logout has already emptied - so auth history cannot leak.
   */
  readonly messages = computed<ChatMessage[]>(() =>
    this.connecting() || this.sessionId() ? this.authMsgs() : this.guestMsgs(),
  );

  private replyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private socketSubs: Subscription[] = [];
  private scrollBottom = false;

  private readonly threadEl = viewChild<ElementRef<HTMLElement>>("threadEl");

  constructor() {
    // These effects react to isOpen()/principal() and update chat-state signals
    // (sessionId, authMsgs, guestMsgs, connecting…). Angular forbids signal writes
    // in effects by default (NG0600), which silently aborted the clearing logic and
    // caused logged-in history to leak into guest view - so allowSignalWrites is required.
    const opts = { allowSignalWrites: true } as const;

    // Identity-aware resolver. Resolves the right chat for the current identity and
    // resets cleanly whenever the identity changes (login, logout, OR switching demo
    // accounts) so one account's session/history can NEVER appear under another.
    // Each account uses its own server-side session (ensureSession, userId-scoped on
    // the backend); guests use the local sessionStorage chat.
    effect(() => {
      const open = this.widget.isOpen();
      const principal = this.auth.principal();
      const pid = principal?.id ?? null;
      if (pid !== this.lastPrincipalId) {
        this.lastPrincipalId = pid;
        // Wipe the accumulated quote-flow data so one identity's details (address,
        // name, phone, answers) can NEVER carry into the next account or guest.
        this.resetQuoteFlowState();
        // Identity changed: drop the previous identity's in-memory session state so
        // the new identity re-resolves its OWN session (never reuse a stale sessionId).
        this.cancelPendingReply();
        this.sessionId.set(null);
        this.authMsgs.set([]);
        this.initError.set("");
        if (pid) {
          // Logged in / switched account: guest history must never bleed into an account.
          this.guestMsgs.set([]);
          this.clearGuestStorage();
        }
      }
      if (open) {
        if (principal) this.ensureSession();
        else this.loadGuest();
      }
    }, opts);
    // Close: stop any in-flight typing reply so it can't land after the panel is gone.
    effect(() => {
      if (!this.widget.isOpen()) {
        this.cancelPendingReply();
      }
    }, opts);
    // Queue, don't drop. Confirming a second card (or typing) WHILE a reply is in flight
    // had its send() dropped by the busy guard, so the bot never received it and re-asked
    // ("I gave you the date"). When the chat goes idle, fire the queued message — its
    // collectedData carries the full accumulated prefill, so the bot catches up on every
    // field even if an intermediate ack was skipped.
    effect(() => {
      const busy = this.sending() || this.connecting();
      if (!busy && this.pendingDraft) {
        const queued = this.pendingDraft;
        this.pendingDraft = null;
        queueMicrotask(() => {
          this.draft = queued;
          this.send();
        });
      }
    }, opts);
    // Load the category's budget ranges once a category is confirmed, so the
    // budget step renders the same slider as the quote form.
    effect(() => {
      const cid = this.widget.prefillData()["categoryId"];
      if (typeof cid === "string" && cid) this.loadBudgetRanges(cid);
    }, opts);
    // Persist guest chat so it survives a page refresh, but clears when the tab/
    // window closes (sessionStorage semantics). Only while not logged in.
    effect(() => {
      const msgs = this.guestMsgs();
      if (!this.auth.principal()) {
        try {
          sessionStorage.setItem(this.GUEST_CHAT_KEY, JSON.stringify(msgs));
        } catch {
          /* quota/private mode */
        }
      }
    }, opts);
    // Persist guest quote prefill (name/phone/address) so a refresh can greet the
    // returning guest by name. Only WRITE when there's data — never overwrite the
    // stored prefill with the empty initial state on load (that race would erase
    // the very data we want to restore). Clearing is explicit (clearGuestPrefill).
    // Also writes to localStorage so a service hyperlink opened in a new tab can
    // carry the chat's prefill data (sessionStorage is per-tab).
    effect(() => {
      const data = this.widget.prefillData();
      if (this.auth.principal()) return;
      const hasData = Object.values(data).some(
        (v) => v !== undefined && v !== null && v !== "",
      );
      if (hasData) {
        try {
          sessionStorage.setItem(this.GUEST_PREFILL_KEY, JSON.stringify(data));
        } catch {
          /* quota/private mode */
        }
        try {
          localStorage.setItem(
            "msvc_latest_chat_prefill",
            JSON.stringify(data),
          );
        } catch {
          /* quota/private mode */
        }
      }
    }, opts);

    // Auto-send: when a pendingQuestion is set and the chat panel is open and ready,
    // fire the question as if the user typed it.
    effect(() => {
      const q = this.widget.pendingQuestion();
      if (!q) return;
      // Ready means: panel is open, not connecting, and either authenticated with a
      // session OR in guest mode (no session needed).
      if (!this.widget.isOpen()) return;
      if (this.connecting()) return;
      const ready = this.sessionId() || !this.auth.principal();
      if (!ready) return;
      // Clear the pending so it only fires once.
      this.widget.pendingQuestion.set("");
      // Dispatch the question as a user-typed message.
      this.draft = q;
      this.updateConvoLang(q);
      this.send();
    }, opts);
  }

  private chatSoundEnabled = signal(true);
  private typingAudioCtx: AudioContext | null = null;
  private typingSoundEnabled = signal(true);
  private guestAutoOpenTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadChatSettings();
    // Track the route so the global guest FAB can hide on home (which has its own).
    this.currentUrl.set(this.router.url);
    this.socketSubs.push(
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe((e) => this.currentUrl.set(e.urlAfterRedirects)),
    );
    this.socketSubs.push(
      this.socketSvc
        .on<string>("connect")
        .subscribe(() => this.widget.chatStatus.set("active")),
      // Do NOT flip to 'offline' on a socket disconnect: the AI assistant answers
      // over HTTP, so it stays available even when the realtime socket drops.
      this.socketSvc.on<number>("chat.unread").subscribe((n) => {
        this.widget.chatUnread.set(n);
        if (n > 0) this.playChatSound();
      }),
      this.socketSvc.on<string>("chat.typing").subscribe(() => {
        this.widget.chatStatus.set("typing");
        this.playTypingSound();
        setTimeout(() => {
          if (this.widget.chatStatus() === "typing")
            this.widget.chatStatus.set("active");
        }, 3000);
      }),
    );
  }

  ngOnDestroy(): void {
    this.cancelPendingReply();
    this.cancelGuestAutoOpen();
    for (const s of this.socketSubs) s.unsubscribe();
  }

  private cancelPendingReply(): void {
    if (this.replyTimeoutId !== null) {
      clearTimeout(this.replyTimeoutId);
      this.replyTimeoutId = null;
    }
    this.clearStuckTimer();
    this.sending.set(false);
  }

  ngAfterViewChecked(): void {
    if (this.scrollBottom) {
      this.scrollBottom = false;
      this.threadEl()?.nativeElement?.scrollTo(0, 99999);
    }
  }

  private loadChatSettings(): void {
    this.api.get<PublicConfig>("/config/public").subscribe({
      next: (r) => {
        // Greetings (all tiers)
        this.widget.setGreetingTiers({
          anonymous: r.chatGreetings ?? [],
          returning: r.chatGreetingsReturning ?? [],
          customer: r.chatGreetingsCustomer ?? [],
          servicer: r.chatGreetingsServicer ?? [],
          admin: r.chatGreetingsAdmin ?? [],
        });

        // Guest auto-open (only for unauthenticated users)
        if (this.auth.principal()) return;
        if (r.chatGuestAutoOpen === false) return;
        const delay = r.chatGuestAutoOpenDelay || 3000;
        this.guestAutoOpenTimer = setTimeout(() => {
          // Don't auto-open on the quote form - the floating button stays, but the
          // panel must not steal focus while the user is filling out a quote.
          if (this.router.url.includes("/quote/new")) return;
          if (!this.auth.principal() && !this.widget.isOpen()) {
            this.widget.open();
          }
        }, delay);
      },
      error: () => {},
    });
  }

  private cancelGuestAutoOpen(): void {
    if (this.guestAutoOpenTimer !== null) {
      clearTimeout(this.guestAutoOpenTimer);
      this.guestAutoOpenTimer = null;
    }
  }

  statusLabel(): string {
    const s = this.widget.chatStatus();
    if (s === "active") return "Active now";
    if (s === "typing") return "Typing…";
    return "Offline";
  }

  formatMessage(content: string): string {
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = escaped
      // Links open in a new tab with an external-link icon so the user keeps the chat.
      .replace(
        /\[([^\]]+)\]\((\/[^)\s]+|https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1<span class="ext-icon">↗</span></a>',
      )
      // **bold** -> <strong> (model emits markdown bold; render it, don't leak the asterisks)
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br />");
    return this.sanitizer.sanitize(SecurityContext.HTML, html) as string;
  }

  handleThreadClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    // Internal quote-form links (service mentions → /quote/new?category=…): carry the
    // in-progress prefill so the user keeps everything the chat already collected,
    // instead of landing on a blank form. goToQuoteForm encodes prefillData + category.
    const m = href.match(/\/(?:guest|customer)\/quote\/new\?category=([0-9a-fA-F-]+)/);
    if (m) {
      event.preventDefault();
      this.goToQuoteForm({ categoryId: m[1] });
      return;
    }
    // target="_blank" links (other external) open in a new tab - let the browser handle
    // them instead of routing in-app and closing the chat.
    if (anchor.getAttribute("target") === "_blank") return;
    if (href.startsWith("/")) {
      event.preventDefault();
      this.widget.close();
      this.router.navigateByUrl(href);
    }
  }

  /**
   * When the chat is open on a live quote form, payload that lets the assistant
   * tailor help to the current step and fill fields in the real form.
   */
  private formAssistBody(): Record<string, unknown> {
    if (!this.router.url.includes("/quote/new") || !this.assist.active())
      return {};
    const ctx = this.assist.context();
    return ctx ? { formAssist: true, formContext: ctx } : {};
  }

  /** Track whether a quote_prefill card was already shown, so duplicates are dropped. */
  private prefillSeen = false;

  /** Apply any form_fill actions to the live form; return the rest for rendering. */
  private applyFormFills(
    blocks?: { type: string; data: Record<string, unknown> }[],
  ): { type: string; data: Record<string, unknown> }[] | undefined {
    if (!blocks?.length) return blocks;
    const rest: { type: string; data: Record<string, unknown> }[] = [];
    for (const b of blocks) {
      if (b.type === "quote_prefill") {
        if (this.prefillSeen) continue; // dedup — show once
        this.prefillSeen = true;
      }
      if (b.type === "quote_field") {
        const qk =
          typeof b.data["key"] === "string" ? (b.data["key"] as string) : "";
        if (
          qk === "addressNo" ||
          qk === "streetDetails" ||
          qk === "postcode" ||
          qk === "propertyType"
        ) {
          const qv = b.data["value"];
          if (qv != null && String(qv) !== "")
            this.widget.accumulatePrefill({ [qk]: String(qv) });
          continue; // silently stored, no visible card
        }
      }
      if (b.type === "form_fill") {
        const key =
          typeof b.data["key"] === "string" ? (b.data["key"] as string) : "";
        const value = b.data["value"] != null ? String(b.data["value"]) : "";
        if (key) this.assist.setField(key, value);
      } else if (b.type === "category_lock") {
        // Silently lock the confirmed category. The model emits this when the user
        // confirms a service by ANY means (tapping the card OR typing "yep"), so the
        // categoryId is captured and the questionSchema can load even on text-confirm.
        // Not rendered (stripped here).
        const cid =
          typeof b.data["categoryId"] === "string"
            ? (b.data["categoryId"] as string)
            : "";
        if (cid && !this.widget.prefillData()["categoryId"]) {
          this.widget.accumulatePrefill({ categoryId: cid });
        }
        // Collapse the matching quote_options card so a text-confirm ("yep") shows
        // as resolved just like tapping "Yes, that's it".
        if (cid) this.markCardResolved(cid);
      } else {
        rest.push(b);
      }
    }
    return rest.length ? rest : undefined;
  }

  /** True when a field already holds a non-empty value in prefillData. */
  private fieldAlreadySet(key: string): boolean {
    const v = this.widget.prefillData()[key];
    return v !== undefined && v !== null && v !== "";
  }

  /**
   * Apply any pre-filled values the assistant extracted from the user's message
   * (e.g. "next sunday night budget RM600") so the flow shows them as already
   * answered instead of re-asking. The quote_field card still renders, but
   * pre-filled and confirmed.
   *
   * CLOBBER GUARD: the model re-scans the WHOLE conversation every turn and
   * re-emits values, including stale ones from earlier (e.g. an old address the
   * user already replaced). This path must only FILL fields that are still empty,
   * never overwrite a value the user already set - otherwise the submitted quote
   * silently reverts to an old value. (Direct card confirms use accumulatePrefill
   * and intentionally overwrite; that is the user's own action, so it is fine.)
   */
  private applyQuoteFieldValues(
    blocks?: { type: string; data: Record<string, unknown> }[],
  ): void {
    if (!blocks) return;
    for (const b of blocks) {
      // quote_question with a value = the assistant mapped a free-text answer to a
      // questionSchema option. Record it (collapsed) so the card shows it answered.
      if (b.type === "quote_question") {
        const qk =
          typeof b.data["key"] === "string" ? (b.data["key"] as string) : "";
        const qv = b.data["value"];
        if (qk && qv != null && qv !== "" && !this.questionAnswered(qk)) {
          this.setQuestionAnswer(b.data, qv);
        }
        continue;
      }
      if (b.type !== "quote_field") continue;
      const key =
        typeof b.data["key"] === "string" ? (b.data["key"] as string) : "";
      // Combined contact card carries name/phone as separate fields, not a single value.
      if (key === "contact") {
        const n = b.data["name"] != null ? String(b.data["name"]) : "";
        const p = b.data["phone"] != null ? String(b.data["phone"]).trim() : "";
        const nameOpen = !this.fieldAlreadySet("contactName");
        const phoneOpen = !this.fieldAlreadySet("contactNumber");
        if (n && nameOpen) this.contactNameDraft.set(n);
        if (p && phoneOpen) {
          // Split a pre-filled number into prefix + local so the dropdown matches.
          const match = this.phonePrefixes.find((c) => p.startsWith(c.code));
          if (match) {
            this.phonePrefix.set(match.code);
            this.contactPhoneLocal.set(p.slice(match.code.length));
          } else {
            this.contactPhoneLocal.set(p.replace(/^\+/, ""));
          }
        }
        if (n && p && nameOpen && phoneOpen) {
          this.contactConfirmed.set(true);
          this.widget.accumulatePrefill({ contactName: n, contactNumber: p });
        }
        continue;
      }
      const raw = b.data["value"];
      const value = raw != null && raw !== "" ? String(raw) : "";
      if (!value) {
        // A fresh card with no value OVERWRITES any prior UNCONFIRMED draft: the
        // user edited the date/time but messaged again without confirming, so the
        // new card must not stay stuck showing that stale local edit — reset it.
        if (key === "preferredDate" && !this.dateConfirmed())
          this.prefillDate.set("");
        else if (key === "timeSlot" && !this.timeConfirmed())
          this.prefillTimeSlot.set("");
        continue;
      }
      if (!key) continue;
      // Don't let a stale re-extracted value overwrite what the user already set.
      if (this.fieldAlreadySet(key)) continue;
      // Normalise a phone (model/extractor may store "0111123456" or "111123456")
      // into a proper +60 number for display + submit.
      const storeValue =
        key === "contactNumber" ? this.normalizePhone(value) : value;
      this.widget.accumulatePrefill({ [key]: storeValue });
      if (key === "preferredDate") {
        this.prefillDate.set(value);
        this.dateConfirmed.set(value);
      } else if (key === "timeSlot") {
        this.prefillTimeSlot.set(value);
        this.timeConfirmed.set(value);
        this.timeConfirmedLabel.set(this.tSlot(value));
      } else if (key === "address") {
        this.addrStreet.set(value);
        this.addressConfirmed.set(true);
      } else if (key === "budgetMax" || key === "budgetMin") {
        // The stated amount is the user's CEILING - pick the lowest bracket whose
        // top covers it (never a bracket that starts above their budget). If ranges
        // aren't loaded yet, loadBudgetRanges applies the same rule from prefillData.
        const n = Number(value);
        const ranges = this.budgetRanges();
        if (!Number.isNaN(n) && ranges.length) {
          let idx = ranges.findIndex((r) => r.max == null || n <= r.max);
          if (idx < 0) idx = ranges.length - 1;
          this.budgetSliderIdx.set(idx);
        }
      } else {
        // contactName / contactNumber / notes etc. - show as confirmed text.
        this.confirmedTextValues.update((m) => ({ ...m, [key]: value }));
      }
    }
  }

  /** Field keys already captured - lets the backend pick the next quote step. */
  private collectedKeys(): string[] {
    const d = this.widget.prefillData();
    return Object.keys(d).filter((k) => {
      const v = d[k];
      return v !== undefined && v !== null && v !== "";
    });
  }

  /** Exact confirmed field VALUES sent to the backend so the assistant recaps real
   *  data (never invented). Only the base quote fields the bot narrates. */
  private collectedValues(): Record<string, string> {
    const d = this.widget.prefillData();
    const keys = [
      "preferredDate",
      "timeSlot",
      "address",
      "budgetMin",
      "budgetMax",
      "contactName",
      "contactNumber",
      "notes",
      "propertyType",
    ];
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = d[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") out[k] = String(v).trim();
    }
    return out;
  }

  send(): void {
    this.clearStuckTimer();
    const text = this.draft.trim();
    // Guard double-submit: input stays enabled while a reply is in flight (so
    // keyboard focus is never lost), but we must not fire a second request.
    if (!text) return;
    // Busy: don't DROP this message (that's how rapid card-confirms got lost) — queue the
    // latest and the flush effect fires it when the reply lands. collectedData on that send
    // carries the whole accumulated prefill, so no field is lost even if a turn is coalesced.
    if (this.connecting() || this.sending() || this.forceCardInput()) {
      this.pendingDraft = text;
      this.draft = "";
      return;
    }

    // Gated "clear my quote": handled locally with a 2-confirmation gate; never reaches
    // the backend until confirmed, so an offhand "reset" can't wipe a half-finished quote.
    if (this.maybeClearQuote(text)) {
      this.draft = "";
      return;
    }

    // Deterministically confirm a single pending service card on an affirmation,
    // before sending, so categoryLocked/categoryId go out with this request.
    this.maybeTextConfirmCategory(text);

    // Mode is decided solely by whether a JWT session is live, so the buffer we
    // write to always matches the buffer the computed renders.
    if (this.sessionId()) {
      this.sendAuthenticated(text);
    } else {
      this.sendGuest(text);
    }
  }

  clear(): void {
    this.clearing.set(true);
    // Wipe EVERYTHING: in-progress quote data (name/phone/date/category), the
    // persisted guest prefill, and the archived prior thread — a cleared chat must
    // not keep remembering "Brian" or offer to continue an old session.
    this.resetQuoteFlowState();
    this.clearGuestPrefill();
    this.archivedGuestMsgs = null;
    this.identityConfirmed.set(null);
    const sid = this.sessionId();
    if (sid) {
      this.api.delete(`/chat/session/${sid}/messages`).subscribe({
        next: () => {
          this.authMsgs.set([]);
          this.clearing.set(false);
        },
        error: () => {
          this.clearing.set(false);
        },
      });
    } else {
      this.guestMsgs.set([]);
      this.clearGuestStorage();
      this.clearing.set(false);
    }
  }

  // ─── Automated QA harness ──────────────────────────────────────────────────
  // Engine: chat-qa-harness.ts (pure). Runner: ChatQaService (shared, writes the log).
  // This component only adapts the harness's QaHost onto the real card handlers +
  // signals. PIN-gated (QA_PIN); the button is rendered only in dev builds.
  readonly qa = inject(ChatQaService);
  /** The QA button only renders in dev builds (demo/dev deploy), never in production. */
  protected readonly qaVisible = !environment.production;
  /** How many runs the next QA press fires (manual int input, default 1, max 500). */
  protected readonly qaRuns = signal(1);
  /** Inline QA panel open state + PIN draft (no window.prompt — renders in-DOM). */
  protected readonly qaPanelOpen = signal(false);
  protected readonly qaPin = signal("");
  /** Clamp + store the run-count input. */
  protected setQaRuns(v: unknown): void {
    const n = Math.floor(Number(v));
    this.qaRuns.set(Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 1);
  }

  /** QA button: stop if running, else toggle the inline PIN/run panel. */
  onQaPress(): void {
    if (this.qa.running()) {
      this.qa.cancel();
      return;
    }
    this.qaPanelOpen.update((o) => !o);
    if (this.qaPanelOpen()) this.qa.status.set("");
  }

  /** Run button inside the panel: check the PIN, then start the suite. */
  startQa(): void {
    if (this.qaPin().trim() !== QA_PIN) {
      this.qa.status.set("Wrong QA PIN");
      return;
    }
    this.qaPin.set("");
    this.qaPanelOpen.set(false);
    const count = Math.min(500, Math.max(1, this.qaRuns()));
    const customerMode = this.auth.principal()?.role === "customer";
    this.qa.start(this.buildQaHost(), { count, customerMode });
  }

  /** The label text the UI actually renders for a card (localized), for QA checks. */
  private qaRenderedLabel(b: { type: string; data: Record<string, unknown> }): string {
    switch (b.type) {
      case "quote_field":
        return this.fieldLabel(this.getStr(b.data, "key"));
      case "quote_question":
        return this.qLabel(b.data);
      case "quote_options":
        return this.getStr(b.data, "category") || this.getStr(b.data, "label");
      default:
        return this.getStr(b.data, "label");
    }
  }

  /** Adapter: maps the harness's card actions onto this component's handlers/signals. */
  private buildQaHost(): QaHost {
    return {
      clear: () => this.clear(),
      // Simulate a page refresh: drop the in-memory thread and re-run guest load, which
      // restores prefill + the returning-guest "is this {name}?" identity confirm from
      // storage (NOT wiped). Guest mode only — the QA refresh test runs as guest.
      refresh: () => {
        this.guestMsgs.set([]);
        this.loadGuest();
      },
      // Press "Review & submit", land on /quote/new, walk the quote form to the Summary
      // (stop, no submit), collect a per-page report, then go back home for the next run.
      submitAndVerifyForm: async () => {
        const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
        this.submitPrefill(); // navigates to /quote/new?prefill=…
        const t0 = Date.now();
        while (!this.qaFormBridge.active() && Date.now() - t0 < 8000) await wait(200);
        await wait(1600); // let the prefill + budget ranges apply
        let lines: string[];
        if (this.qaFormBridge.active()) {
          try {
            lines = await this.qaFormBridge.walk();
          } catch (e) {
            lines = [`FORM CHECK ERROR: ${(e as Error)?.message ?? String(e)}`];
          }
        } else {
          lines = ["FORM CHECK: quote form did not load within 8s"];
        }
        this.router.navigate(["/"]); // back to home for the next run
        await wait(500);
        return lines;
      },
      messages: () =>
        this.messages().map((m) => ({
          role: m.role,
          // Strip any stale [⚙ ...] annotation that was injected by a prior buggy
          // version — the LLM echoes them back as if they were real conversation.
          content: m.content.replace(/\[⚙[^\]]*\]\s*/g, ""),
          // Enrich each block with what the UI actually RENDERS — the localized label
          // and the card language — so the harness can check correct-language + dupes,
          // not just the raw block type.
          blocks: (m.actionBlocks ?? []).map((b) => ({
            type: b.type,
            data: { ...b.data, renderedLabel: this.qaRenderedLabel(b), cardLang: this.cardLang() },
          })),
        })),
      sending: () => this.sending(),
      prefill: () => this.widget.prefillData(),
      budgetRangeCount: () => this.budgetRanges().length,
      sendText: (t) => {
        this.draft = t;
        this.updateConvoLang(t);
        this.send();
      },
      lockCategory: (b) => this.continueQuoteInChat(b.data),
      rejectCategory: (b) => this.rejectCategory(b.data),
      confirmDate: (v) => {
        this.prefillDate.set(v);
        this.confirmDate();
      },
      confirmTime: (v) => {
        this.prefillTimeSlot.set(v);
        this.confirmTime();
      },
      confirmAddress: (a) => {
        this.addrNo.set(a.no);
        this.addrStreet.set(a.street);
        this.addrPostcode.set(a.postcode);
        this.addrPropertyType.set(a.propertyType);
        this.confirmAddress();
      },
      confirmPropertyType: (v) => {
        this.addrPropertyType.set(v);
        this.confirmPropertyType();
      },
      confirmBudget: (i) => {
        this.budgetSliderIdx.set(i);
        this.confirmBudget();
      },
      confirmTextField: (key, val) => {
        this.prefillText.set(val);
        this.confirmText(key);
      },
      confirmPhone: (local) => {
        this.contactPhoneLocal.set(local);
        this.confirmPhone();
      },
      answerQuestion: (b, answer) => this.qaAnswerQuestion(b, answer),
      confirmIdentity: (yes) => this.confirmIdentity(yes),
      judge: (text, mode) =>
        firstValueFrom(
          this.api.post<{ result: string }>("/chat/qa-judge", {
            transcript: text,
            mode,
          }),
        )
          .then((r) => r?.result ?? "")
          .catch(() => "JUDGE_UNAVAILABLE: request failed"),
    };
  }

  /** Answer a service-question card with a valid value for its type. */
  /**
   * Apply the human-style answer the harness computed for a service-question card.
   * The harness owns the persona/language/service, so it decides WHAT to say; this
   * just drives the matching control (radio/checkbox/number/quantity/free text).
   */
  private qaAnswerQuestion(b: QaBlock, answer: QaAnswer): void {
    const data = b.data;
    switch (answer.qtype) {
      case "radio":
        if (answer.radio) {
          this.answerRadio(data, answer.radio);
        } else {
          this.qText.set(answer.text || "not sure, please advise");
          this.confirmQText(data);
        }
        break;
      case "checkbox":
        if (answer.checkbox?.length) {
          this.qCheckbox.set(answer.checkbox);
          this.confirmQCheckbox(data);
        } else {
          this.qText.set(answer.text || "not sure, please advise");
          this.confirmQText(data);
        }
        break;
      case "number":
        this.qNumber.set(answer.number ?? 1);
        this.confirmQNumber(data);
        break;
      case "quantity":
        if (answer.quantity && Object.keys(answer.quantity).length) {
          for (const [value, n] of Object.entries(answer.quantity)) {
            for (let i = 0; i < n; i++) this.incQ(value);
          }
          this.confirmQQuantity(data);
        } else {
          this.qNumber.set(answer.number ?? 2);
          this.confirmQNumber(data);
        }
        break;
      default:
        this.qText.set(answer.text || "not sure, please advise");
        this.confirmQText(data);
        break;
    }
  }

  /** null = not asked / unanswered; true/false once the returning guest replies. */
  identityConfirmed = signal<boolean | null>(null);

  /** Returning-guest identity confirm. Yes keeps the remembered contact + address;
   *  No wipes them so the next quote starts clean. */
  confirmIdentity(yes: boolean): void {
    this.identityConfirmed.set(yes);
    const name =
      (
        this.widget.prefillData()["contactName"] as string | undefined
      )?.trim() ?? "";
    if (yes) {
      this.appendAssistantBubble(
        name
          ? `Great, welcome back ${name}! How can I help you today?`
          : "Welcome back! How can I help you today?",
      );
    } else {
      // Drop the remembered identity + address; keep nothing personal.
      this.widget.accumulatePrefill({
        contactName: "",
        contactNumber: "",
        address: "",
      });
      this.contactNameDraft.set("");
      this.contactPhoneLocal.set("");
      this.addrStreet.set("");
      this.addressConfirmed.set(false);
      this.clearGuestPrefill();
      this.appendAssistantBubble(
        "No problem, let's start fresh. How can I help you today?",
      );
    }
  }

  /** Append an assistant bubble to whichever buffer is active. */
  private appendAssistantBubble(content: string): void {
    const msg: ChatMessage = {
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    };
    if (this.sessionId()) this.authMsgs.update((m) => [...m, msg]);
    else this.guestMsgs.update((m) => [...m, msg]);
    this.scrollBottom = true;
  }

  /** Append a user bubble locally (used when the chat handles a message itself, e.g. the
   *  gated "clear my quote" flow, instead of round-tripping to the backend). */
  private appendUserBubble(content: string): void {
    const msg: ChatMessage = {
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    if (this.sessionId()) this.authMsgs.update((m) => [...m, msg]);
    else this.guestMsgs.update((m) => [...m, msg]);
    this.scrollBottom = true;
  }

  /**
   * Conversational "clear my quote" with a confirmation GATE: after the user asks, they
   * must confirm TWICE more before anything is wiped, so an offhand "reset" never nukes a
   * half-finished quote. Counts the turns with an if/else; returns true when it handled
   * the message (so send() skips the backend). Only clears the QUOTE data — the chat
   * thread stays.
   */
  private clearQuoteAsks = 0;
  private maybeClearQuote(text: string): boolean {
    const t = text.toLowerCase();
    const wantsClear =
      /\b(clear|reset|wipe|delete|cancel|discard|scrap|start over|start again|start fresh)\b/.test(t) &&
      /\b(quote|booking|order|detail|details|everything|data|form|all)\b|\bstart (over|again|fresh)\b/.test(t);
    const confirming =
      /\b(yes|yep|yeah|ya|confirm|sure|ok|okay|go ahead|do it|please|correct|betul|ye|是的|对|ஆம்)\b/.test(t);
    const hasData =
      this.collectedKeys().length > 0 || !!this.widget.prefillData()["categoryId"];

    // Nothing to clear → not our concern.
    if (!hasData) {
      this.clearQuoteAsks = 0;
      return false;
    }
    // Not a clear request and no clear pending → let the message flow normally.
    if (this.clearQuoteAsks === 0 && !wantsClear) return false;
    // Mid-confirmation but they changed the subject → abort the clear, let it flow.
    if (this.clearQuoteAsks > 0 && !confirming && !wantsClear) {
      this.clearQuoteAsks = 0;
      return false;
    }

    this.appendUserBubble(text);
    this.clearQuoteAsks++;
    if (this.clearQuoteAsks <= 2) {
      // Request (1) and first confirm (2): keep gating — need 2 confirmations after asking.
      this.appendAssistantBubble(
        this.clearQuoteAsks === 1
          ? "Just to be sure — clear your current quote and start fresh? Your saved details will be wiped. Reply yes to confirm."
          : "This erases everything you've entered so far. Are you sure? Reply yes once more to clear.",
      );
    } else {
      // Second confirm (3): actually clear the quote data (conversation stays).
      this.clearQuoteAsks = 0;
      this.resetQuoteFlowState();
      this.clearGuestPrefill();
      this.appendAssistantBubble(
        "Done — your quote details have been cleared. What would you like to book?",
      );
    }
    return true;
  }

  /** Greeting tier + display name for the signed-in user. */
  private roleGreeting(): { tier: string; name: string } {
    const p = this.auth.principal();
    if (!p) return { tier: "anonymous", name: "" };
    const name = ((p as { name?: string }).name ?? "").trim();
    if (p.role === "admin") return { tier: "admin", name };
    if (p.role === "servicer") return { tier: "servicer", name };
    return { tier: "customer", name };
  }

  /** Prefill input signals for chat-based quote field collection. */
  prefillText = signal("");
  prefillDate = signal("");
  prefillTimeSlot = signal("");

  /** Structured chat address: No. / Street (Places-picked) / Postcode. */
  addrNo = signal("");
  addrStreet = signal("");
  addrPostcode = signal("");
  addrPropertyType = signal("");
  private addrLat: number | null = null;
  private addrLng: number | null = null;
  addressConfirmed = signal(false);
  addressFormatted = signal("");

  /** True when the address card is showing and not yet confirmed — forces the user to
   *  fill the form instead of typing in chat. */
  readonly forceCardInput = computed(() => {
    if (this.addressConfirmed()) return false;
    const msgs = this.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "assistant") continue;
      if (m.actionBlocks?.some((b) => b.type === "quote_field" && b.data["key"] === "address")) return true;
    }
    return false;
  });
  locatingGps = signal(false);
  addrValidating = signal(false);
  addrError = signal("");

  /** Composed single-line address from the three structured fields. */
  composedAddress = computed(() => {
    const parts = [
      this.addrNo().trim(),
      this.addrStreet().trim(),
      this.addrPostcode().trim(),
    ];
    return parts.filter(Boolean).join(", ");
  });

  /** Malaysian postcode = exactly 5 digits. */
  postcodeValid = computed(() => /^\d{5}$/.test(this.addrPostcode().trim()));

  /** Combined contact card: name + phone in one card. Phone = a country-code
   *  prefix chosen from a dropdown (default Malaysia +60) + the local number. */
  contactNameDraft = signal("");
  phonePrefix = signal("+60");
  contactPhoneLocal = signal("");
  contactConfirmed = signal(false);

  /** Common country dialling codes for the prefix dropdown (Malaysia first). */
  phonePrefixes = [
    { code: "+60", label: "🇲🇾 +60" },
    { code: "+65", label: "🇸🇬 +65" },
    { code: "+62", label: "🇮🇩 +62" },
    { code: "+66", label: "🇹🇭 +66" },
    { code: "+63", label: "🇵🇭 +63" },
    { code: "+84", label: "🇻🇳 +84" },
    { code: "+95", label: "🇲🇲 +95" },
    { code: "+91", label: "🇮🇳 +91" },
    { code: "+86", label: "🇨🇳 +86" },
    { code: "+880", label: "🇧🇩 +880" },
    { code: "+92", label: "🇵🇰 +92" },
    { code: "+977", label: "🇳🇵 +977" },
    { code: "+44", label: "🇬🇧 +44" },
    { code: "+1", label: "🇺🇸 +1" },
    { code: "+61", label: "🇦🇺 +61" },
  ];

  /** Full E.164-style number: chosen prefix + local digits. */
  fullPhone = computed(() => {
    const local = this.contactPhoneLocal()
      .replace(/[\s\-()]/g, "")
      .replace(/^0+/, "");
    return `${this.phonePrefix()}${local}`;
  });

  /**
   * Global phone validation (many users are non-Malaysian, e.g. WhatsApp from
   * abroad). The combined prefix + local must be a leading + and 7–15 digits
   * (E.164 range).
   */
  phoneValid = computed(() => /^\+\d{7,15}$/.test(this.fullPhone()));

  /** Confirmed free-text quote fields, keyed by field name (name/phone/notes…). */
  confirmedTextValues = signal<Record<string, string>>({});

  /** Date/time confirmed state - shows confirmation after user picks */
  dateConfirmed = signal("");
  timeConfirmed = signal("");
  timeConfirmedLabel = signal("");

  timeSlotOptions = [
    { value: "morning", label: "🌅 Morning (9:00–11:00)" },
    { value: "noon", label: "☀️ Noon (11:00–13:00)" },
    { value: "afternoon", label: "🌆 Afternoon (13:00–15:00)" },
    { value: "evening", label: "🌙 Evening (15:00–17:00)" },
    { value: "night", label: "🌃 Night (17:00–22:00)" },
  ];

  /** Per-category budget ranges (same source as the quote form). */
  budgetRanges = signal<Array<{ min: number; max: number | null }>>([]);
  budgetSliderIdx = signal(0);
  budgetChosen = signal(false);
  private budgetLoadedFor = "";

  /** Budget is "answered" if confirmed via the slider OR a value already landed in
   *  prefillData (e.g. the user typed "500" in chat). Collapses the budget card. */
  budgetAnswered = computed(() => {
    if (this.budgetChosen()) return true;
    const v = this.widget.prefillData()["budgetMax"];
    return v != null && String(v) !== "";
  });

  rangeLabel(r: { min: number; max: number | null }): string {
    return r.max == null ? `RM ${r.min}+` : `RM ${r.min}–${r.max}`;
  }

  /** Load budget ranges for the confirmed category (once per category). */
  private loadBudgetRanges(categoryId: string): void {
    if (!categoryId || this.budgetLoadedFor === categoryId) return;
    this.budgetLoadedFor = categoryId;
    this.api
      .get<{
        ranges: Array<{ min: number; max: number | null }>;
      }>("/quotes/budget-ranges", { categoryId })
      .subscribe({
        next: (r) => {
          const ranges = r.ranges ?? [];
          this.budgetRanges.set(ranges);
          // Preselect by the user's CEILING: the lowest bracket whose top covers their
          // stated budget (never one that starts above it).
          const pre = Number(this.widget.prefillData()["budgetMax"]);
          if (ranges.length && !Number.isNaN(pre) && pre > 0) {
            let idx = ranges.findIndex((rg) => rg.max == null || pre <= rg.max);
            if (idx < 0) idx = ranges.length - 1;
            this.budgetSliderIdx.set(idx);
          }
        },
        error: () => {
          this.budgetRanges.set([]);
        },
      });
  }

  onBudgetSlide(idx: number): void {
    this.budgetSliderIdx.set(idx);
  }

  /** Confirm the budget selection: accumulate it and advance the flow. */
  confirmBudget(): void {
    const r = this.budgetRanges()[this.budgetSliderIdx()];
    if (!r) return;
    this.budgetChosen.set(true);
    this.widget.accumulatePrefill({
      budgetIndex: this.budgetSliderIdx(),
      budgetMin: r.min,
      budgetMax: r.max ?? r.min,
    });
    this.draft = `${this.t("budgetMax")}: ${this.rangeLabel(r)}`;
    this.send();
  }

  prefillSummary = computed(() => {
    const d = this.widget.prefillData();
    const items: Array<{ label: string; value: string }> = [];
    // WHITELIST only - internal keys (categoryId, lat, lng, budgetIndex, budgetMin/Max,
    // paymentMode) must never leak into the human-facing summary. Labels translated.
    const order: Array<[string, string]> = [
      ["preferredDate", "sDate"],
      ["timeSlot", "sTime"],
      ["address", "sAddress"],
      ["contactName", "sName"],
      ["contactNumber", "sPhone"],
      ["notes", "sNotes"],
    ];
    for (const [key, lblKey] of order) {
      const val = d[key];
      if (val === undefined || val === null || val === "") continue;
      const value =
        key === "timeSlot" ? this.tSlot(val as string) : String(val);
      if (value) items.push({ label: this.t(lblKey), value });
    }
    // Budget shown as a readable bracket (never the raw index/min/max). For a typed
    // value (only budgetMax), map it to the bracket that contains it.
    const bmax = d["budgetMax"];
    if (bmax != null && String(bmax) !== "") {
      const n = Number(bmax);
      const bmin = d["budgetMin"];
      let blabel = "";
      if (bmin != null && String(bmin) !== "") {
        blabel = this.rangeLabel({ min: Number(bmin), max: n });
      } else if (!Number.isNaN(n)) {
        const bracket = this.budgetRanges().find(
          (r) => n >= r.min && (r.max == null || n <= r.max),
        );
        blabel = bracket ? this.rangeLabel(bracket) : `RM ${n}`;
      }
      if (blabel) items.push({ label: this.t("sBudget"), value: blabel });
    }
    // Service question answers (with their labels), for the final review.
    for (const { label, display } of Object.values(this.qDisplay())) {
      if (display) items.push({ label, value: display });
    }
    return items;
  });

  getStr(data: Record<string, unknown>, key: string): string {
    const v = data[key];
    return typeof v === "string" ? v : "";
  }

  runAction(action: string): void {
    if (action === "report_booking") {
      this.router.navigate(["/customer/bookings"]);
      this.widget.close();
    } else if (action === "report_bug") {
      this.injectAssistantMessage(
        "Sorry you hit a problem. Please describe what happened — what you were doing and what went wrong — and I'll log it for the team.",
      );
    }
  }

  /**
   * Re-send the most recent user message. Shown on the "couldn't answer" fallback:
   * the first failover attempt usually warms up the backup LLM, so a second try a
   * moment later goes through (the exhausted primary stays in its 429 cooldown).
   */
  /** Consecutive Try-again attempts. After 3 the button is hidden (Request a
   *  service only); reset when a real (non-fallback) reply lands. */
  retryCount = signal(0);

  retryLastMessage(): void {
    if (this.sending() || this.connecting()) return;
    const msgs = this.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        this.retryCount.update((n) => n + 1);
        this.draft = msgs[i].content;
        this.send();
        return;
      }
    }
  }

  // ─── Stuck-flow watchdog ─────────────────────────────────────────────────────
  private stuckTimer: ReturnType<typeof setTimeout> | null = null;
  private stuckRecoveryDone = false;

  /**
   * Self-heal a stranded quote flow. If the assistant PROMISED a card ("let me
   * check", "here is the service that fits") but emitted none, mid quote-flow, and
   * the user just sits there, after 5s we re-fire their last message once. The
   * backend's self-recovery prompt rule makes the model apologise, clarify, and
   * show the card. Capped to one auto-recovery per stuck point (resets when a real
   * card arrives) so it can never loop.
   */
  private armStuckWatchdog(
    replyText: string,
    isGuest: boolean,
    forSessionId: string | undefined,
  ): void {
    this.clearStuckTimer();
    if (this.stuckRecoveryDone) return;
    const txt = replyText.trim();
    // The reply promised a card/service but emitted none. Match common "card coming"
    // phrasings, OR any reply that ends with a colon ("Here you go:") which always
    // promises something next.
    const promisedCard =
      /let me check|here (you go|it is|'?s|is |are )|the service that fits|pick the one|take a look|let me share|that('?s| is) the right|this is the|we (do|can) (offer|help)|right one for you/i.test(
        txt,
      ) || /[:：]\s*$/.test(txt);
    if (!promisedCard) return;
    const inQuoteFlow = this.messages().some((m) =>
      m.actionBlocks?.some((b) => b.type.startsWith("quote_")),
    );
    if (!inQuoteFlow) return;
    this.stuckTimer = setTimeout(() => {
      this.stuckTimer = null;
      if (this.sending() || this.connecting()) return;
      if (
        isGuest ? this.sessionId() !== null : this.sessionId() !== forSessionId
      )
        return;
      this.stuckRecoveryDone = true;
      this.retryLastMessage();
    }, 5000);
  }

  private clearStuckTimer(): void {
    if (this.stuckTimer) {
      clearTimeout(this.stuckTimer);
      this.stuckTimer = null;
    }
  }

  /** Record a date pick (no send) - the Confirm button advances the flow. */
  onDateSelected(value: string): void {
    // Local only — do NOT commit to prefillData until Confirm, so an unconfirmed
    // edit can't block the assistant from filling a value it resolves from text.
    this.prefillDate.set(value);
  }

  /** Confirm the picked date: lock it in and tell the assistant to continue. */
  confirmDate(): void {
    const value = this.prefillDate();
    if (!value) return;
    this.widget.accumulatePrefill({ preferredDate: value });
    this.dateConfirmed.set(value);
    this.draft = `${this.t("preferredDate")}: ${value}`;
    this.send();
  }

  /** Record a time-slot selection (no send) - Confirm advances the flow. */
  onTimeSlotSelected(value: string): void {
    // Local only — committed on Confirm (see onDateSelected).
    this.prefillTimeSlot.set(value);
  }

  /** Confirm the picked time slot and tell the assistant to continue. */
  confirmTime(): void {
    const value = this.prefillTimeSlot();
    if (!value) return;
    const label = this.tSlot(value);
    this.timeConfirmed.set(value);
    this.timeConfirmedLabel.set(label);
    this.widget.accumulatePrefill({ timeSlot: value });
    this.draft = `${this.t("timeSlot")}: ${label}`;
    this.send();
  }

  /** Confirm a free-text field (name, phone, notes…) and advance the flow. */
  confirmText(key: string): void {
    const value = this.prefillText().trim();
    if (!value || !key) return;
    this.widget.accumulatePrefill({ [key]: value });
    this.confirmedTextValues.update((m) => ({ ...m, [key]: value }));
    this.draft = this.fieldSendPhrase(key, value);
    this.prefillText.set("");
    this.send();
  }

  /** Natural sentence the assistant reads back after a text field is confirmed. */
  private fieldSendPhrase(key: string, value: string): string {
    switch (key) {
      case "contactName":
        return `${this.t("contactName")}: ${value}`;
      case "contactNumber":
        return `${this.t("contactNumber")}: ${value}`;
      case "notes":
        return value;
      default:
        return `${this.fieldLabel(key)}: ${value}`;
    }
  }

  /** Category cards the user has already acted on (confirmed or rejected) - their
   *  buttons collapse so they can't be clicked again and re-trigger the flow. */
  resolvedCards = signal<string[]>([]);

  /** The currently confirmed category id (locks every quote_options card). */
  confirmedCategoryId = computed(() =>
    String(this.widget.prefillData()["categoryId"] ?? ""),
  );

  /** A category card is resolved once acted on, or once ANY category is confirmed. */
  cardResolved(categoryId: string): boolean {
    return (
      this.confirmedCategoryId() !== "" ||
      this.resolvedCards().includes(categoryId)
    );
  }

  private markCardResolved(categoryId: string): void {
    if (categoryId && !this.resolvedCards().includes(categoryId)) {
      this.resolvedCards.update((ids) => [...ids, categoryId]);
    }
  }

  /**
   * Deterministic text-confirm: when the user types an affirmation and exactly ONE
   * service card is still pending, lock that category and collapse the card right
   * away — no waiting on the model to emit category_lock (which it often forgets).
   * Ambiguous cases (0 or 2+ pending cards) are left to the assistant.
   */
  private maybeTextConfirmCategory(text: string): void {
    if (this.widget.prefillData()["categoryId"]) return;
    if (
      !/^\s*(yep|yes|yeah|yup|sure|ok(ay)?|correct|right|that('?s| is)?( it| the one)?|the first( one)?|do it|proceed|go ahead|confirm(ed)?|let'?s go|sounds good)\b/i.test(
        text,
      )
    )
      return;
    const resolved = new Set(this.resolvedCards());
    const pending: string[] = [];
    for (const m of this.messages()) {
      for (const b of m.actionBlocks ?? []) {
        if (b.type === "quote_options") {
          const cid = b.data["categoryId"] as string | undefined;
          if (cid && !resolved.has(cid) && !pending.includes(cid))
            pending.push(cid);
        }
      }
    }
    if (pending.length === 1) {
      this.widget.accumulatePrefill({ categoryId: pending[0] });
      this.markCardResolved(pending[0]);
    }
  }

  continueQuoteInChat(data: Record<string, unknown>): void {
    const category = (data["category"] as string) || "";
    // Confirming a service starts a fresh booking — clear any stale field data left
    // over from an earlier topic in this session (date/address/etc.), then set the
    // chosen category. Safe: the backend never pre-fills fields before a category is
    // picked, so nothing collected-this-flow is lost.
    this.resetQuoteFlowState();
    this.markCardResolved(data["categoryId"] as string);
    this.widget.accumulatePrefill({ categoryId: data["categoryId"] as string });
    // Send a follow-up message to advance the conversational flow. categoryLocked
    // (set from prefillData above) tells the backend to suppress further category
    // suggestion cards, so confirming can't loop back to the same prompt.
    this.draft = category
      ? `${this.t("service")}: ${category}`
      : this.t("service");
    this.send();
  }

  /**
   * The user rejected the suggested category ("Not this service"). Tell the
   * assistant its guess was wrong so it asks a clarifying question and suggests
   * a better-fitting service instead of proceeding.
   */
  rejectCategory(data: Record<string, unknown>): void {
    const category = (data["category"] as string) || "";
    this.markCardResolved(data["categoryId"] as string);
    this.draft = category
      ? `${this.t("svcReject")}: ${category}`
      : this.t("svcReject");
    this.send();
  }

  /**
   * A Street suggestion was picked from the Google Places dropdown. Because the
   * user selected one specific place, it resolves unambiguously, so we can safely
   * auto-fill the postcode from it. When a typed street has several same-name
   * matches across Malaysia, the user simply doesn't pick one and the postcode
   * stays for them to enter - exactly the "don't autocomplete an ambiguous
   * postcode" rule.
   */
  onChatPlaceSelect(place: PlaceResult): void {
    this.addrStreet.set(place.street || place.address || "");
    if (place.postcode) this.addrPostcode.set(place.postcode);
    this.addrLat = place.lat ?? null;
    this.addrLng = place.lng ?? null;
  }

  /** GPS pin: resolve the current location to Street + Postcode (not the unit No.). */
  locateViaGps(): void {
    if (!navigator.geolocation) return;
    this.locatingGps.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.addrLat = lat;
        this.addrLng = lng;
        this.api
          .post<{
            valid: boolean;
            formattedAddress?: string;
            street?: string;
            postcode?: string;
          }>("/chat/reverse-geocode", { lat, lng })
          .subscribe({
            next: (r) => {
              this.locatingGps.set(false);
              if (r.valid) {
                if (r.street) this.addrStreet.set(r.street);
                else if (r.formattedAddress)
                  this.addrStreet.set(r.formattedAddress);
                if (r.postcode) this.addrPostcode.set(r.postcode);
              }
            },
            error: () => this.locatingGps.set(false),
          });
      },
      () => this.locatingGps.set(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  /**
   * Confirm the structured address. Geocode-validate the composed address first
   * so a hand-typed street + postcode that doesn't actually exist can't be
   * confirmed - we only advance with a real, Google-resolved address.
   */
  confirmAddress(): void {
    // Require every field the quote form marks * (No, Type, Street, Postcode) so the
    // handoff can't land with a half-empty address.
    if (
      !this.addrNo().trim() ||
      !this.addrStreet().trim() ||
      !this.postcodeValid() ||
      !this.addrPropertyType()
    )
      return;
    const composed = this.composedAddress();
    this.addrError.set("");
    this.addrValidating.set(true);
    this.api
      .post<{
        valid: boolean;
        formattedAddress?: string;
        city?: string;
        state?: string;
        lat?: number;
        lng?: number;
      }>("/chat/validate-address", { address: `${composed}, Malaysia` })
      .subscribe({
        next: (r) => {
          this.addrValidating.set(false);
          if (r.valid && r.formattedAddress) {
            this.addressFormatted.set(r.formattedAddress);
            this.widget.accumulatePrefill({ address: r.formattedAddress });
            if (r.lat != null && r.lng != null) {
              this.widget.accumulatePrefill({ lat: r.lat, lng: r.lng });
            }
            this.widget.accumulatePrefill({
              addressNo: this.addrNo().trim(),
              streetDetails: this.addrStreet().trim(),
              postcode: this.addrPostcode().trim(),
              propertyType: this.addrPropertyType(),
            });
            // District + State from the geocode → carried to the /quote/new form so the
            // full address is pre-filled (the chat card doesn't show these fields).
            if (r.city) this.widget.accumulatePrefill({ district: r.city });
            if (r.state) this.widget.accumulatePrefill({ state: r.state });
            this.addressConfirmed.set(true);
            this.draft = `${this.t("address")}: ${r.formattedAddress}`;
            this.send();
          } else {
            // Geocode returned invalid — fall back to the raw composed address so the
            // flow can continue (the backend's extractAddress will find it in text).
            this.addrError.set(
              "We couldn't verify this address. Check the street and postcode, or pick a suggestion from the dropdown.",
            );
            this.widget.accumulatePrefill({ address: composed });
            this.addressConfirmed.set(true);
            this.draft = `${this.t("address")}: ${composed}`;
            this.send();
          }
        },
        error: () => {
          this.addrValidating.set(false);
          // Geocode API unavailable — fall back to raw address so the flow continues.
          this.widget.accumulatePrefill({ address: composed });
          this.addressConfirmed.set(true);
          this.draft = `${this.t("address")}: ${composed}`;
          this.send();
        },
      });
  }

  confirmPropertyType(): void {
    const pt = this.addrPropertyType();
    if (!pt) return;
    this.widget.accumulatePrefill({ propertyType: pt });
    this.draft = `${this.t("propertyType")}: ${pt}`;
    this.send();
  }

  /** Confirm the combined contact card: store name + phone and advance the flow. */
  confirmContact(): void {
    const name = this.contactNameDraft().trim();
    const phone = this.fullPhone();
    if (!name || !this.phoneValid()) return;
    this.widget.accumulatePrefill({ contactName: name, contactNumber: phone });
    this.contactConfirmed.set(true);
    this.draft = `${this.t("contactName")}: ${name}, ${this.t("contactNumber")}: ${phone}`;
    this.send();
  }

  /** Confirm the phone-only card (name is collected separately as a text card). */
  confirmPhone(): void {
    if (!this.phoneValid()) return;
    const phone = this.fullPhone();
    this.widget.accumulatePrefill({ contactNumber: phone });
    this.draft = `${this.t("contactNumber")}: ${phone}`;
    this.send();
  }

  /** True when a field already holds a non-empty value in prefillData (public for templates). */
  valueCollected(key: string): boolean {
    const v = this.widget.prefillData()[key];
    return v !== undefined && v !== null && v !== "";
  }

  /** Normalise a phone into a +60 Malaysian number (drop spaces/dashes + leading
   *  0, prepend +60) unless it already carries a country code. */
  private normalizePhone(v: string): string {
    const raw = (v ?? "").replace(/[\s\-()]/g, "");
    if (!raw) return v;
    if (raw.startsWith("+")) return raw;
    const local = raw.replace(/^0+/, "");
    return local ? `+60${local}` : v;
  }

  // ─── Service questionSchema answers (quote_question cards) ───────────────────
  /** Working drafts for the current question card (one shows at a time). */
  qCheckbox = signal<string[]>([]);
  qText = signal("");
  qNumber = signal<number | null>(null);
  qQuantity = signal<Record<string, number>>({});
  qQuantityTotal = computed(() =>
    Object.values(this.qQuantity()).reduce((a, b) => a + b, 0),
  );

  /** Confirmed question answers, stored in prefillData.serviceDetails (submitted as-is). */
  serviceAnswers = computed(
    () =>
      (this.widget.prefillData()["serviceDetails"] as Record<
        string,
        unknown
      >) ?? {},
  );
  /** Question keys with a non-empty answer — sent to the backend so it knows what's done. */
  answeredQuestions = computed(() =>
    Object.entries(this.serviceAnswers())
      .filter(([, v]) => this.isAnswered(v))
      .map(([k]) => k),
  );

  private isAnswered(v: unknown): boolean {
    if (v == null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object")
      return Object.values(v as Record<string, number>).some(
        (n) => Number(n) > 0,
      );
    return true;
  }

  questionAnswered(key: string): boolean {
    return this.isAnswered(this.serviceAnswers()[key]);
  }

  getBool(data: Record<string, unknown>, key: string): boolean {
    return data[key] === true;
  }

  getOptions(
    data: Record<string, unknown>,
  ): Array<{ value: string; label: string }> {
    const o = data["options"];
    return Array.isArray(o)
      ? (o as Array<{ value: string; label: string }>)
      : [];
  }

  private qLabel(data: Record<string, unknown>): string {
    return String(data["label"] ?? "Answer");
  }
  private optLabel(data: Record<string, unknown>, value: string): string {
    return this.getOptions(data).find((o) => o.value === value)?.label ?? value;
  }

  /** Readable confirmed-answer string for a question card. */
  answerDisplay(data: Record<string, unknown>): string {
    const v = this.serviceAnswers()[String(data["key"])];
    if (Array.isArray(v))
      return v.map((x) => this.optLabel(data, String(x))).join(", ");
    if (v && typeof v === "object") {
      return Object.entries(v as Record<string, number>)
        .filter(([, n]) => Number(n) > 0)
        .map(([k, n]) => `${this.optLabel(data, k)} ×${n}`)
        .join(", ");
    }
    const opts = this.getOptions(data);
    if (opts.length) {
      const o = opts.find((x) => x.value === String(v));
      if (o) return o.label;
    }
    return String(v ?? "");
  }

  /** Readable label+answer per question, for the final review summary. */
  qDisplay = signal<Record<string, { label: string; display: string }>>({});

  private setQuestionAnswer(
    data: Record<string, unknown>,
    value: unknown,
  ): void {
    const key = String(data["key"]);
    this.widget.accumulatePrefill({
      serviceDetails: { ...this.serviceAnswers(), [key]: value },
    });
    // answerDisplay reads the just-set value (computed updates synchronously).
    this.qDisplay.update((m) => ({
      ...m,
      [key]: { label: this.qLabel(data), display: this.answerDisplay(data) },
    }));
  }
  private resetQDrafts(): void {
    this.qCheckbox.set([]);
    this.qText.set("");
    this.qNumber.set(null);
    this.qQuantity.set({});
  }

  answerRadio(data: Record<string, unknown>, value: string): void {
    this.setQuestionAnswer(data, value);
    this.resetQDrafts();
    this.draft = `${this.qLabel(data)}: ${this.optLabel(data, value)}.`;
    this.send();
  }
  toggleQCheckbox(value: string): void {
    this.qCheckbox.update((a) =>
      a.includes(value) ? a.filter((x) => x !== value) : [...a, value],
    );
  }
  confirmQCheckbox(data: Record<string, unknown>): void {
    const sel = this.qCheckbox();
    if (!sel.length) return;
    this.setQuestionAnswer(data, sel);
    this.draft = `${this.qLabel(data)}: ${sel.map((v) => this.optLabel(data, v)).join(", ")}.`;
    this.resetQDrafts();
    this.send();
  }
  confirmQNumber(data: Record<string, unknown>): void {
    const n = this.qNumber();
    if (n === null || n < 0) return;
    this.setQuestionAnswer(data, n);
    this.draft = `${this.qLabel(data)}: ${n}.`;
    this.resetQDrafts();
    this.send();
  }
  confirmQText(data: Record<string, unknown>): void {
    const t = this.qText().trim();
    if (!t) return;
    this.setQuestionAnswer(data, t);
    this.draft = `${this.qLabel(data)}: ${t}.`;
    this.resetQDrafts();
    this.send();
  }
  incQ(value: string): void {
    this.qQuantity.update((q) => ({ ...q, [value]: (q[value] ?? 0) + 1 }));
  }
  decQ(value: string): void {
    this.qQuantity.update((q) => ({
      ...q,
      [value]: Math.max(0, (q[value] ?? 0) - 1),
    }));
  }
  confirmQQuantity(data: Record<string, unknown>): void {
    const cleaned = Object.fromEntries(
      Object.entries(this.qQuantity()).filter(([, n]) => n > 0),
    );
    if (!Object.keys(cleaned).length) return;
    this.setQuestionAnswer(data, cleaned);
    this.draft = `${this.qLabel(data)}: ${Object.entries(cleaned)
      .map(([v, n]) => `${this.optLabel(data, v)} ×${n}`)
      .join(", ")}.`;
    this.resetQDrafts();
    this.send();
  }

  goToQuoteForm(data: Record<string, unknown>): void {
    const categoryId = data["categoryId"] as string;
    const prefill = { ...this.widget.prefillData(), categoryId };
    // Unicode-safe base64: btoa chokes on Tamil/Chinese characters.
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(prefill))));
    const base =
      this.auth.principal()?.role === "customer" ? "/customer" : "/guest";
    this.router.navigate([`${base}/quote/new`], {
      queryParams: { prefill: encoded },
    });
    this.widget.close();
  }

  submitPrefill(): void {
    const data = this.widget.prefillData();
    if (!data.categoryId) return;
    // Unicode-safe base64: btoa chokes on Tamil/Chinese characters.
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const base =
      this.auth.principal()?.role === "customer" ? "/customer" : "/guest";
    this.router.navigate([`${base}/quote/new`], {
      queryParams: { prefill: encoded },
    });
  }

  /** Card language — mirrors the language the customer is currently writing in (scans
   *  the last few user messages so a short "yes" doesn't flip cards back to English). */
  readonly cardLang = computed<CardLang>(() => {
    const users = this.messages()
      .filter((m) => m.role === "user")
      .slice(-6)
      .map((m) => m.content)
      .join(" ");
    return detectCardLang(users);
  });

  /** Translate a card-string key into the current card language (falls back to en). */
  t(key: string): string {
    const row = CARD_T[key];
    return row ? row[this.cardLang()] || row.en : key;
  }

  /** Translated time-slot label for a slot value (morning/noon/afternoon/evening/night). */
  tSlot(value: string): string {
    return this.t("t" + value);
  }

  fieldLabel(key: string): string {
    // Translatable known keys live in CARD_T (contactName, address, timeSlot, budgetMax…).
    return CARD_T[key] ? this.t(key) : key;
  }

  onPrefillField(_key: string, value: string): void {
    // Local only — mirror into prefillText so the generic text card's Confirm
    // button enables as the user types. Do NOT commit to prefillData until Confirm
    // (confirmText does that), so an unconfirmed edit can't block an assistant-
    // resolved value via the clobber guard.
    this.prefillText.set(value);
  }

  editProfileField(data: Record<string, unknown>): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      const field = this.getStr(data, "field");
      const value = data["value"];
      this.api.post("/chat/apply-profile", { pin, field, value }).subscribe({
        next: () => {
          this.injectAssistantMessage(
            `✅ ${this.getStr(data, "label") || field} has been updated.`,
          );
        },
        error: (e) => {
          this.injectAssistantMessage(
            `❌ Could not update profile: ${e?.message || "Unknown error"}.`,
          );
        },
      });
    });
  }

  navigateAction(href: string): void {
    if (href.startsWith("/")) {
      this.widget.close();
      this.router.navigateByUrl(href);
    }
  }

  /** Injects a system-style assistant message into the active chat buffer. */
  private injectAssistantMessage(content: string): void {
    const msg: ChatMessage = {
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    };
    if (this.sessionId()) {
      this.authMsgs.update((m) => [...m, msg]);
    } else {
      this.guestMsgs.update((m) => [...m, msg]);
    }
    this.scrollBottom = true;
    this.sending.set(false);
  }

  private sendGuest(text: string): void {
    // "Continue last session": pull the archived prior thread back instead of
    // starting fresh from the returning-guest greeting. Only when there's something
    // archived (set by the returning greeting in loadGuest).
    if (
      this.archivedGuestMsgs &&
      this.archivedGuestMsgs.length > 0 &&
      ((/\b(continue|resume|carry on|pick up|go back)\b/i.test(text) &&
        /\b(last|previous|prior|earlier|where|session|chat|conversation|left off)\b/i.test(
          text,
        )) ||
        /what (did |were )?we (talk|talked|discuss|discussed|chat|chatted|saying|said)/i.test(
          text,
        ))
    ) {
      const archived = this.archivedGuestMsgs;
      this.archivedGuestMsgs = null;
      this.identityConfirmed.set(true);
      this.guestMsgs.set([
        ...archived,
        { role: "user", content: text, createdAt: new Date().toISOString() },
        {
          role: "assistant",
          content:
            "Sure, here's where we left off. How can I help you continue?",
          createdAt: new Date().toISOString(),
        },
      ]);
      this.draft = "";
      this.scrollBottom = true;
      return;
    }
    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    this.guestMsgs.update((m) => [...m, userMsg]);
    this.draft = "";
    this.scrollBottom = true;
    this.sending.set(true);

    const history = this.guestMsgs()
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));
    const role = this.auth.principal()?.role ?? "guest";

    this.api
      .post<{
        reply: string;
        createdAt?: string;
        actionBlocks?: { type: string; data: Record<string, unknown> }[];
      }>("/chat/guest", { message: text, history, role, lang: this.convoLang(), categoryLocked: !!this.widget.prefillData().categoryId, collected: this.collectedKeys(), collectedData: this.collectedValues(), categoryId: this.widget.prefillData()["categoryId"] as string | undefined, answeredQuestions: this.answeredQuestions(), ...this.formAssistBody() })
      .subscribe({
        next: (r) => {
          const mapped = r.actionBlocks?.map((b) => ({
            type: b.type as string,
            data: b.data as Record<string, unknown>,
          }));
          const blocks = this.applyFormFills(mapped);
          this.applyQuoteFieldValues(blocks);
          this.delayedReply(r.reply, r.createdAt, undefined, blocks);
        },
        error: () => {
          const errMsg: ChatMessage = {
            role: "assistant",
            content: "Could not send message. Please try again.",
            createdAt: new Date().toISOString(),
          };
          this.guestMsgs.update((m) => [...m, errMsg]);
          this.scrollBottom = true;
          this.sending.set(false);
        },
      });
  }

  private sendAuthenticated(text: string): void {
    const sessionAtSend = this.sessionId();
    if (!sessionAtSend) return;
    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    this.authMsgs.update((m) => [...m, userMsg]);
    this.scrollBottom = true;
    this.draft = "";
    this.sending.set(true);
    this.widget.actionBlocks.set([]);

    this.api
      .post<{
        reply: string;
        createdAt?: string;
        actions?: ChatMessage["actions"];
        actionBlocks?: { type: string; data: Record<string, unknown> }[];
      }>(`/chat/session/${sessionAtSend}/message`, { message: text, lang: this.convoLang(), categoryLocked: !!this.widget.prefillData().categoryId, collected: this.collectedKeys(), collectedData: this.collectedValues(), categoryId: this.widget.prefillData()["categoryId"] as string | undefined, answeredQuestions: this.answeredQuestions(), ...this.formAssistBody() })
      .subscribe({
        next: (r) => {
          const mapped = r.actionBlocks?.map((b) => ({
            type: b.type as string,
            data: b.data as Record<string, unknown>,
          }));
          const blocks = this.applyFormFills(mapped);
          this.applyQuoteFieldValues(blocks);
          if (blocks && blocks.length > 0) {
            this.widget.actionBlocks.set(blocks);
          }
          this.delayedReply(r.reply, r.createdAt, sessionAtSend, blocks);
        },
        error: () => {
          // Ignore a late error if the session changed or ended (logout) meanwhile.
          if (this.sessionId() !== sessionAtSend) return;
          const errMsg: ChatMessage = {
            role: "assistant",
            content: "Could not send message. Please try again.",
            createdAt: new Date().toISOString(),
          };
          this.authMsgs.update((m) => [...m, errMsg]);
          this.scrollBottom = true;
          this.sending.set(false);
        },
      });
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private fallbackReply =
    "Thanks for your message. I'm the My Home Servicer assistant - I can help with quotes, bookings, payments, reorders, and reporting problems. What can I help with?";

  /**
   * forSessionId: snapshot of the session at send time (undefined = guest).
   * The reply is dropped if the mode changed before the typing delay elapsed,
   * so a logged-in reply never lands in guest view and vice versa.
   */
  private delayedReply(
    content: string,
    createdAt?: string,
    forSessionId?: string,
    actionBlocks?: Array<{ type: string; data: Record<string, unknown> }>,
  ): void {
    // A reply without a retry action = a real answer (not the failure fallback) →
    // reset the Try-again counter so the next genuine failure starts fresh.
    if (!actionBlocks?.some((b) => b.type === "retry")) this.retryCount.set(0);
    const reply = content || this.fallbackReply;
    const isGuest = forSessionId === undefined;
    const parts = this.splitReply(reply);
    const ms =
      this.auth.principal()?.role === "admin" ? 0 : 300 + Math.random() * 500;
    if (this.replyTimeoutId !== null) clearTimeout(this.replyTimeoutId);
    // First bubble after the main typing delay; remaining bubbles drip in one by
    // one (revealParts) with a short typing pause between each.
    this.replyTimeoutId = setTimeout(() => {
      this.replyTimeoutId = null;
      this.revealParts(
        parts,
        0,
        createdAt,
        forSessionId,
        isGuest,
        actionBlocks,
      );
    }, ms);
  }

  /** Split a reply into bubbles: paragraphs first, else lines. Capped. */
  private splitReply(text: string): string[] {
    const byPara = text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (byPara.length > 1) return byPara.slice(0, 6);
    const byLine = text
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (byLine.length > 1) return byLine.slice(0, 6);
    return [text.trim() || this.fallbackReply];
  }

  /** Append one reply part, then schedule the next with a 0.5-1.5s typing pause. */
  private revealParts(
    parts: string[],
    idx: number,
    createdAt: string | undefined,
    forSessionId: string | undefined,
    isGuest: boolean,
    actionBlocks?: Array<{ type: string; data: Record<string, unknown> }>,
  ): void {
    // Drop the whole sequence if the chat mode changed (login/logout/session swap).
    if (isGuest) {
      if (this.sessionId() !== null) {
        this.sending.set(false);
        return;
      }
    } else {
      if (this.sessionId() !== forSessionId) {
        this.sending.set(false);
        return;
      }
    }

    const msg: ChatMessage = {
      role: "assistant",
      content: parts[idx],
      createdAt:
        idx === 0
          ? (createdAt ?? new Date().toISOString())
          : new Date().toISOString(),
    };
    if (isGuest) this.guestMsgs.update((m) => [...m, msg]);
    else this.authMsgs.update((m) => [...m, msg]);
    this.scrollBottom = true;

    const moreText = idx < parts.length - 1;
    if (moreText) {
      // Keep the typing indicator up, then drip the next text part.
      this.sending.set(true);
      const gap = 300 + Math.random() * 500;
      this.replyTimeoutId = setTimeout(() => {
        this.replyTimeoutId = null;
        this.revealParts(
          parts,
          idx + 1,
          createdAt,
          forSessionId,
          isGuest,
          actionBlocks,
        );
      }, gap);
      return;
    }

    // Text done. Action blocks (date pickers etc.) drip in one at a time — each
    // as its own message bubble, like the text parts — so cards stream in naturally
    // instead of flashing all at once in a pre-allocated container.
    if (actionBlocks?.length) {
      this.revealCards(actionBlocks, 0, createdAt, forSessionId, isGuest);
      return;
    }

    this.sending.set(false);
    // No card in this reply — if it promised one and stranded the user, self-heal.
    this.armStuckWatchdog(parts.join(" "), isGuest, forSessionId);
  }

  /** Reveal action blocks one at a time, each as its own message bubble, so cards
   *  stream in naturally instead of flashing all at once. */
  private revealCards(
    blocks: Array<{ type: string; data: Record<string, unknown> }>,
    idx: number,
    createdAt: string | undefined,
    forSessionId: string | undefined,
    isGuest: boolean,
  ): void {
    if (idx >= blocks.length) {
      this.sending.set(false);
      this.stuckRecoveryDone = false;
      this.clearStuckTimer();
      return;
    }
    if (isGuest) {
      if (this.sessionId() !== null) {
        this.sending.set(false);
        return;
      }
    } else {
      if (this.sessionId() !== forSessionId) {
        this.sending.set(false);
        return;
      }
    }
    const cardMsg: ChatMessage = {
      role: "assistant",
      content: "",
      createdAt: createdAt ?? new Date().toISOString(),
      actionBlocks: [blocks[idx]],
    };
    if (isGuest) this.guestMsgs.update((m) => [...m, cardMsg]);
    else this.authMsgs.update((m) => [...m, cardMsg]);
    this.scrollBottom = true;
    this.sending.set(true);
    const gap = 300 + Math.random() * 500;
    this.replyTimeoutId = setTimeout(() => {
      this.replyTimeoutId = null;
      this.revealCards(blocks, idx + 1, createdAt, forSessionId, isGuest);
    }, gap);
  }

  /**
   * Guest chat is intentionally ephemeral - never persisted. It lives only in the
   * in-memory signal for the current panel session, so nothing can leak across
   * logout, account switches, or page reloads.
   */
  /** sessionStorage key for the guest chat (survives refresh, clears on tab close). */
  private readonly GUEST_CHAT_KEY = "msvc_guest_chat";

  private readGuestStorage(): ChatMessage[] | null {
    try {
      const raw = sessionStorage.getItem(this.GUEST_CHAT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed as ChatMessage[]) : null;
    } catch {
      return null;
    }
  }

  private clearGuestStorage(): void {
    try {
      sessionStorage.removeItem(this.GUEST_CHAT_KEY);
    } catch {
      /* private mode */
    }
  }

  /** sessionStorage key for the guest quote prefill (name/phone/address/etc.). */
  private readonly GUEST_PREFILL_KEY = "msvc_guest_prefill";
  /** Prior-session messages archived behind the returning greeting, restored on
   *  "continue last session". */
  private archivedGuestMsgs: ChatMessage[] | null = null;

  private readGuestPrefill(): PrefillData | null {
    try {
      const raw = sessionStorage.getItem(this.GUEST_PREFILL_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object"
        ? (parsed as PrefillData)
        : null;
    } catch {
      return null;
    }
  }

  /** Re-persist a sanitized guest prefill (e.g. after dropping a poisoned name). */
  private persistGuestPrefill(data: PrefillData): void {
    try {
      sessionStorage.setItem(this.GUEST_PREFILL_KEY, JSON.stringify(data));
    } catch {
      /* quota/private mode */
    }
  }

  /**
   * A stored contactName is only trustworthy as a real name. Reject the false
   * positives the old free-text extractor produced ("From" from "I'm from KL",
   * "Here", "Contact", etc.): require a single capitalised token and exclude a
   * small stopword set. Used to gate the returning-guest "is this {name}?" greeting.
   */
  private isPlausibleName(name: string): boolean {
    const n = name.trim();
    if (!/^[A-Z][A-Za-z'’-]{1,29}$/.test(n)) return false;
    const stop = new Set([
      "from", "and", "the", "your", "our", "name", "number", "contact", "here",
      "there", "yes", "no", "nope", "ok", "okay", "sure", "hi", "hey", "hello",
      "thanks", "today", "tomorrow", "tonight", "morning", "noon", "afternoon",
      "evening", "night", "address", "phone", "details", "please", "this", "that",
    ]);
    return !stop.has(n.toLowerCase());
  }

  private clearGuestPrefill(): void {
    try {
      sessionStorage.removeItem(this.GUEST_PREFILL_KEY);
    } catch {
      /* private mode */
    }
    try {
      localStorage.removeItem("msvc_latest_chat_prefill");
    } catch {
      /* private mode */
    }
  }

  /**
   * Clear ALL accumulated quote-flow state - the shared prefillData plus every
   * local card signal. Called on any identity change so a previous user's or
   * guest's quote details (address, name, phone, budget, answers) can never leak
   * into the next account or guest in the same tab.
   */
  private resetQuoteFlowState(): void {
    this.prefillSeen = false;
    this.widget.resetPrefill();
    this.resolvedCards.set([]);
    this.dateConfirmed.set("");
    this.timeConfirmed.set("");
    this.timeConfirmedLabel.set("");
    this.prefillDate.set("");
    this.prefillTimeSlot.set("");
    this.prefillText.set("");
    this.addrNo.set("");
    this.addrStreet.set("");
    this.addrPostcode.set("");
    this.addrPropertyType.set("");
    this.addressConfirmed.set(false);
    this.addressFormatted.set("");
    this.addrError.set("");
    this.addrValidating.set(false);
    this.addrLat = null;
    this.addrLng = null;
    this.contactNameDraft.set("");
    this.contactPhoneLocal.set("");
    this.phonePrefix.set("+60");
    this.contactConfirmed.set(false);
    this.budgetChosen.set(false);
    this.budgetSliderIdx.set(0);
    this.confirmedTextValues.set({});
    this.qCheckbox.set([]);
    this.qText.set("");
    this.qNumber.set(null);
    this.qQuantity.set({});
    this.qDisplay.set({});
  }

  private loadGuest(): void {
    this.sessionId.set(null);
    this.initError.set("");
    if (this.guestMsgs().length === 0) {
      const restored = this.readGuestStorage();
      const savedPrefill = this.readGuestPrefill();
      const rawName = (
        savedPrefill?.["contactName"] as string | undefined
      )?.trim();
      // Guard against a poisoned name from the old free-text extractor (e.g. "From"
      // captured from "I'm from KL"). Only greet by a plausible name; otherwise drop
      // it and purge it from storage so the bad value can't keep resurfacing.
      const name = rawName && this.isPlausibleName(rawName) ? rawName : undefined;
      if (rawName && !name && savedPrefill) {
        delete savedPrefill["contactName"];
        this.persistGuestPrefill(savedPrefill);
      }
      if (name && this.widget.hasGreeting()) {
        // Returning guest: restore their prefill, archive the old thread for
        // "continue last session", and greet by name with a yes/no identity confirm.
        this.widget.resetPrefill();
        this.widget.accumulatePrefill(savedPrefill ?? {});
        this.archivedGuestMsgs =
          restored && restored.length > 0 ? restored : null;
        this.identityConfirmed.set(null);
        this.guestMsgs.set([
          {
            role: "assistant",
            content: this.widget.getGreeting("returning", name),
            createdAt: new Date().toISOString(),
            actionBlocks: [{ type: "identity_confirm", data: { name } }],
          },
        ]);
      } else if (restored && restored.length > 0) {
        this.guestMsgs.set(restored);
      } else if (this.widget.hasGreeting()) {
        this.guestMsgs.set([
          {
            role: "assistant",
            content: this.widget.getGreeting("anonymous"),
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    }
  }

  /**
   * Resolves the logged-in user's account-bound chat session. Reuses their most
   * recent 'general' session so history persists across opens; only creates a new
   * one if none exists. Servicer accounts are rejected by the backend (403) and
   * fall back to a local guest chat.
   */
  private ensureSession(): void {
    if (this.sessionId()) {
      this.loadMessages();
      return;
    }
    if (this.connecting()) return;
    this.connecting.set(true);
    this.initError.set("");
    this.api
      .get<{
        data: Array<{ id: string; contextType: string }>;
      }>("/chat/sessions")
      .subscribe({
        next: (r) => {
          // User may have logged out while the request was in-flight.
          if (!this.auth.principal()) {
            this.connecting.set(false);
            return;
          }
          const existing = r.data.find((s) => s.contextType === "general");
          if (existing) {
            this.sessionId.set(existing.id);
            this.connecting.set(false);
            this.loadMessages();
          } else {
            this.createSession();
          }
        },
        error: () => {
          // Servicer (403) or transient failure: fall back to a local guest chat.
          this.connecting.set(false);
          this.loadGuest();
        },
      });
  }

  private createSession(): void {
    this.api
      .post<{ sessionId: string }>("/chat/session", { contextType: "general" })
      .subscribe({
        next: (r) => {
          if (!this.auth.principal()) {
            this.connecting.set(false);
            return;
          }
          this.authMsgs.set([]);
          this.sessionId.set(r.sessionId);
          this.connecting.set(false);
          this.initError.set("");
        },
        error: () => {
          this.connecting.set(false);
          this.loadGuest();
        },
      });
  }

  private loadMessages(): void {
    const sid = this.sessionId();
    if (!sid) return;
    this.api
      .get<{
        data: ChatMessage[];
        hasMore: boolean;
      }>(`/chat/session/${sid}/messages`, { limit: "20" })
      .subscribe({
        next: (r) => {
          // Ignore a late response if the session changed or the user logged out.
          if (this.sessionId() !== sid) return;
          if (r.data.length === 0 && this.widget.hasGreeting()) {
            const rg = this.roleGreeting();
            const greeting = this.widget.getGreeting(rg.tier, rg.name);
            this.authMsgs.set([
              {
                role: "assistant",
                content: greeting,
                createdAt: new Date().toISOString(),
              },
            ]);
          } else {
            this.authMsgs.set(r.data);
          }
          this.scrollBottom = true;
        },
        error: () => {},
      });
  }

  private playChatSound(): void {
    if (!this.chatSoundEnabled()) return;
    try {
      const audio = new Audio("assets/sounds/NotificationChat.wav");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {
      // Audio not available
    }
  }

  private checkChatSoundSetting(): void {
    this.api
      .get<{ data: { key: string; value: unknown }[] }>("/admin/settings")
      .subscribe({
        next: (r) => {
          const s = r.data.find((x) => x.key === "chat_sound_enabled");
          if (s) this.chatSoundEnabled.set(s.value === true);
        },
        error: () => {},
      });
  }

  private checkTypingSoundSetting(): void {
    this.api
      .get<{ data: { key: string; value: unknown }[] }>("/admin/settings")
      .subscribe({
        next: (r) => {
          const s = r.data.find((x) => x.key === "typing_sound_enabled");
          if (s) this.typingSoundEnabled.set(s.value === true);
        },
        error: () => {},
      });
  }

  private playTypingSound(): void {
    if (!this.typingSoundEnabled()) return;
    try {
      if (!this.typingAudioCtx) {
        this.typingAudioCtx = new AudioContext();
      }
      const ctx = this.typingAudioCtx;
      const bufSize = ctx.sampleRate * 0.05;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch {
      // Audio not available
    }
  }
}
