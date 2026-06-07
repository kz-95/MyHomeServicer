import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';
import { DialogService } from '../../core/services/dialog.service';
import { ModalComponent } from '../../shared/modal.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface QuestionOption {
  value: string;
  label: string;
  sortOrder?: number;
  active?: boolean;
}

interface QuestionItem {
  key: string;
  label: string;
  type: 'checkbox' | 'radio' | 'text' | 'quantity' | 'number';
  required?: boolean;
  priced?: boolean;
  description?: string;
  sortOrder?: number;
  active?: boolean;
  options?: QuestionOption[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  imageUrl?: string | null;
  parentCategoryId?: string | null;
  defaultPriceSuggestion?: string | null;
  defaultEstimatedDurationMinutes?: number | null;
  questionSchema?: QuestionItem[] | null;
  allowedTimeSlots?: string[];
  published: boolean;
  bannerUrl?: string | null;
  cardColor?: string | null;
  description?: string | null;
  travelFeeBaseline?: number | null;
  suppliesFeeBaseline?: number | null;
  requiresInspection?: boolean;
  procedure?: string | null;
  photosEnabled?: boolean;
  activeListingCount?: number;
  averagePrice?: number | null;
  priceStatListingCount?: number;
  deletedAt?: string | null;
}

interface RangeRow {
  min: number | null;
  max: number | null;
}

const ALL_TIME_SLOTS = ['morning', 'noon', 'afternoon', 'evening', 'night'];
const TIME_SLOT_LABELS: Record<string, string> = {
  morning: 'Morning (9:00–11:00)', noon: 'Noon (11:00–13:00)', afternoon: 'Afternoon (13:00–15:00)', evening: 'Evening (15:00–17:00)', night: 'Night (17:00–22:00)',
};

type DetailSection = 'basics' | 'schema' | 'budget' | 'slots' | 'subcats' | 'imagery' | 'copy' | 'dispatch';

interface QForm {
  label: string;
  type: 'checkbox' | 'radio' | 'text' | 'quantity' | 'number';
  required: boolean;
  priced: boolean;
  description: string;
  options: Array<{ value: string; label: string; active: boolean; isNew: boolean }>;
}

@Component({
    selector: 'app-admin-category-settings',
    host: { class: 'page-enter' },
    imports: [FormsModule, DragDropModule, ModalComponent, ListToolbarComponent],
    template: `
    <h1>Category Settings</h1>

    <app-list-toolbar>
      <input toolbar-search class="search-input" type="text" placeholder="Search categories…"
             [(ngModel)]="searchQuery" name="search" />
      <div toolbar-filters class="filter-chips">
        <label class="filter-chip" [class.on]="filterHasQuestions()">
          <input type="checkbox" [checked]="filterHasQuestions()" (change)="filterHasQuestions.set(!filterHasQuestions())" hidden />
          Has questions
        </label>
        <label class="filter-chip" [class.on]="filterPublishedOnly()">
          <input type="checkbox" [checked]="filterPublishedOnly()" (change)="filterPublishedOnly.set(!filterPublishedOnly())" hidden />
          Published
        </label>
        <label class="filter-chip" [class.on]="filterTopLevel()">
          <input type="checkbox" [checked]="filterTopLevel()" (change)="filterTopLevel.set(!filterTopLevel())" hidden />
          Top-level
        </label>
      </div>
      <select toolbar-sort class="sort-select" [(ngModel)]="sortOption" name="sort">
        <option value="name-asc">Name A–Z</option>
        <option value="name-desc">Name Z–A</option>
        <option value="listings-desc">Most listings</option>
      </select>
    </app-list-toolbar>

    <div class="list-actions">
      <button class="btn-primary btn-sm" (click)="openNew()">+ New category</button>
    </div>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (loadFailed()) {
      <p class="err">Could not load categories. Refresh and try again.</p>
    } @else {
      @if (selectedCount() > 0) {
        <div class="bulk-bar">
          <span class="bulk-count">{{ selectedCount() }} selected</span>
          <button class="btn-primary btn-sm" (click)="bulkPublish(true)" [disabled]="bulkBusy()">Publish</button>
          <button class="btn-ghost btn-sm" (click)="bulkPublish(false)" [disabled]="bulkBusy()">Unpublish</button>
          <button class="btn-ghost btn-xs" (click)="clearSelection()">Clear</button>
          @if (bulkError()) { <span class="err">{{ bulkError() }}</span> }
        </div>
      }

      <div class="cat-list">
        <div class="cat-row header">
          <label class="cb-wrap">
            <input type="checkbox" [checked]="allSelected()" (change)="toggleSelectAll()" />
          </label>
          <div class="cat-meta"><span class="small muted">Select / deselect all</span></div>
        </div>
        @for (cat of filteredCategories(); track cat.id) {
          <div class="cat-row">
            <label class="cb-wrap">
              <input type="checkbox" [checked]="selectedIds().has(cat.id)" (change)="toggleSelect(cat.id)" />
            </label>
            <div class="cat-meta">
              <span class="cat-name">{{ cat.name }}</span>
              <span class="cat-slug muted small">{{ cat.slug }}</span>
              @if (!cat.published) { <span class="badge unpublished">draft</span> }
              @if ((cat.activeListingCount ?? 0) > 0) {
                <span class="badge listings">{{ cat.activeListingCount }} listing{{ cat.activeListingCount === 1 ? '' : 's' }}</span>
              }
              @if (cat.averagePrice != null && (cat.priceStatListingCount ?? 0) > 0) {
                <span class="badge price">avg RM {{ cat.averagePrice.toFixed(2) }} ({{ cat.priceStatListingCount }} listing{{ cat.priceStatListingCount === 1 ? '' : 's' }})</span>
              }
            </div>
            <div class="cat-actions">
              <button class="btn-ghost btn-xs" (click)="openEdit(cat)">Edit</button>
              <button class="btn-ghost btn-xs danger" (click)="confirmDelete(cat)"
                      [disabled]="deletingId() === cat.id">
                {{ deletingId() === cat.id ? '…' : 'Delete' }}
              </button>
            </div>
          </div>
        } @empty {
          <p class="muted pad">No categories found.</p>
        }
      </div>
    }

    @if (deleteError()) { <p class="err top-gap">{{ deleteError() }}</p> }

    @if (editorOpen()) {
      <app-modal [open]="true" [wide]="true"
                 [title]="editTarget() ? 'Edit - ' + editTarget()!.name : 'New category'"
                 (closed)="closeEditor()">

        <div class="section-tabs">
          <button class="stab" [class.active]="section() === 'basics'" (click)="section.set('basics')">Basics</button>
          <button class="stab" [class.active]="section() === 'schema'" (click)="section.set('schema')">Question Schema</button>
          <button class="stab" [class.active]="section() === 'budget'" (click)="section.set('budget')">Budget Ranges</button>
          <button class="stab" [class.active]="section() === 'slots'" (click)="section.set('slots')">Time Slots</button>
          <button class="stab" [class.active]="section() === 'subcats'" (click)="section.set('subcats')">Sub-categories</button>
          <button class="stab" [class.active]="section() === 'imagery'" (click)="section.set('imagery')">Thumbnail</button>
          <button class="stab" [class.active]="section() === 'copy'" (click)="section.set('copy')">Customer Copy</button>
          <button class="stab" [class.active]="section() === 'dispatch'" (click)="section.set('dispatch')">Dispatch</button>
        </div>

        @if (section() === 'basics') {
          <div class="section-body">
            <label>Name *<input [(ngModel)]="basics.name" name="cname" required /></label>
            @if (!editTarget()) {
              <label>Slug <span class="muted small">(optional - auto-generated from name)</span>
                <input [(ngModel)]="basics.slug" name="cslug" />
              </label>
            } @else {
              <div class="field-readonly">
                <span class="small muted">Slug (locked after creation)</span>
                <span class="mono">{{ editTarget()!.slug }}</span>
              </div>
            }
            <label>Icon <span class="muted small">(icon name, e.g. wrench)</span>
              <input [(ngModel)]="basics.icon" name="cicon" />
            </label>
            <label>Image URL<input [(ngModel)]="basics.imageUrl" name="cimgurl" /></label>
            <label>Default price suggestion (RM)
              <input type="number" min="0" step="0.01" [(ngModel)]="basics.defaultPriceSuggestion" name="cprice" />
            </label>
            <label>Default estimated duration (minutes)
              <input type="number" min="1" [(ngModel)]="basics.defaultEstimatedDurationMinutes" name="cdur" />
            </label>
            <label class="inline-check">
              <input type="checkbox" [(ngModel)]="basics.published" name="cpublished" />
              Published <span class="muted small">(visible to customers and servicers)</span>
            </label>
            @if (basicsError()) { <p class="err">{{ basicsError() }}</p> }
            <div class="modal-actions">
              <button class="btn-ghost" (click)="closeEditor()">Cancel</button>
              <button class="btn-primary" (click)="saveBasics()" [disabled]="savingBasics()">
                {{ savingBasics() ? 'Saving…' : editTarget() ? 'Save basics' : 'Create category' }}
              </button>
            </div>
          </div>
        }

        @if (section() === 'schema') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first to enable schema editing.</p>
            } @else {
              <p class="muted small">Drag rows to reorder. Keys and option values are locked after first save - deactivate instead of removing.</p>
              <div cdkDropList (cdkDropListDropped)="dropQuestion($event)" class="schema-list">
                @for (q of editorSchema(); track q.key; let qi = $index) {
                  <div class="schema-item" [class.inactive]="q.active === false" cdkDrag>
                    <div class="schema-item-hd" cdkDragHandle>
                      <span class="drag-handle">⠿</span>
                      <strong class="q-label">{{ q.label }}</strong>
                      <span class="mono small muted">{{ q.key }}</span>
                      <span class="badge">{{ q.type }}</span>
                      @if (q.priced) { <span class="badge priced">priced</span> }
                      @if (q.active === false) { <span class="badge off">off</span> }
                    </div>
                    <div class="schema-item-actions">
                      <button class="btn-ghost btn-xs" (click)="openQuestionEditor(qi)">Edit</button>
                      <button class="btn-ghost btn-xs" (click)="toggleQuestionActive(qi)">
                        {{ q.active === false ? 'Activate' : 'Deactivate' }}
                      </button>
                    </div>
                  </div>
                }
              </div>
              <button class="btn-ghost btn-sm top-gap" (click)="openQuestionEditor(-1)">+ Add question</button>
              @if (schemaError()) { <p class="err">{{ schemaError() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveSchema()" [disabled]="savingSchema()">
                  {{ savingSchema() ? 'Saving…' : 'Save schema' }}
                </button>
              </div>
            }
          </div>
        }

        @if (section() === 'budget') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">Budget brackets customers choose from. Leave upper value blank for open-ended (e.g. RM 350+).</p>
              @for (r of currentRanges(); track $index) {
                <div class="range-row">
                  <span>RM</span>
                  <input type="number" min="0" [(ngModel)]="r.min" [name]="'rmin' + $index" />
                  <span>–</span>
                  <input type="number" min="0" [(ngModel)]="r.max" [name]="'rmax' + $index" placeholder="(open)" />
                  <button class="btn-ghost btn-xs" (click)="removeRange($index)">✕</button>
                </div>
              }
              <button class="btn-ghost btn-sm" (click)="addRange()">+ Add range</button>
              @if (budgetMsg()) { <p class="row-msg" [class.err]="budgetIsError()">{{ budgetMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveBudgetRanges()" [disabled]="savingBudget()">
                  {{ savingBudget() ? 'Saving…' : 'Save budget ranges' }}
                </button>
              </div>
            }
          </div>
        }

        @if (section() === 'slots') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">Toggle which time slots customers can book for this category.</p>
              <div class="slot-chips">
                @for (slot of ALL_TIME_SLOTS; track slot) {
                  <label class="slot-chip" [class.on]="editorSlots().has(slot)">
                    <input type="checkbox" [checked]="editorSlots().has(slot)"
                           (change)="toggleSlot(slot, $event)" hidden />
                    {{ TIME_SLOT_LABELS[slot] }}
                  </label>
                }
              </div>
              @if (slotsMsg()) { <p class="row-msg" [class.err]="slotsIsError()">{{ slotsMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveSlots()" [disabled]="savingSlots()">
                  {{ savingSlots() ? 'Saving…' : 'Save time slots' }}
                </button>
              </div>
            }
          </div>
        }

        @if (section() === 'subcats') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first to manage sub-categories.</p>
            } @else {
              <p class="muted small">Child categories nested under this one. They reuse the same fields and endpoints.</p>
              <div class="cat-list">
                @for (child of childCategories(); track child.id) {
                  @if (editingSubId() === child.id) {
                    <div class="cat-row inline-edit-row">
                      <div class="inline-edit-fields">
                        <label>Name *<input [(ngModel)]="editingSubForm.name" name="esn{{child.id}}" /></label>
                        <label>Icon <span class="muted small">(icon name, e.g. wrench)</span>
                          <input [(ngModel)]="editingSubForm.icon" name="esi{{child.id}}" />
                        </label>
                        <label class="inline-check">
                          <input type="checkbox" [(ngModel)]="editingSubForm.published" name="esp{{child.id}}" />
                          Published
                        </label>
                      </div>
                      @if (subEditError()) { <p class="err">{{ subEditError() }}</p> }
                      <div class="modal-actions">
                        <button class="btn-ghost btn-xs" (click)="cancelSubEdit()">Cancel</button>
                        <button class="btn-primary btn-xs" (click)="saveEditSub(child)" [disabled]="savingSubEdit()">
                          {{ savingSubEdit() ? '…' : 'Save' }}
                        </button>
                      </div>
                    </div>
                  } @else {
                    <div class="cat-row">
                      <div class="cat-meta">
                        @if (child.icon) { <span class="cat-icon">{{ child.icon }}</span> }
                        <span class="cat-name">{{ child.name }}</span>
                        <span class="cat-slug muted small">{{ child.slug }}</span>
                        @if (!child.published) { <span class="badge unpublished">draft</span> }
                      </div>
                      <div class="cat-actions">
                        <button class="btn-ghost btn-xs" (click)="openSubEdit(child)">Edit</button>
                        <button class="btn-ghost btn-xs danger" (click)="confirmDelete(child)"
                                [disabled]="deletingId() === child.id || (child.activeListingCount ?? 0) > 0">
                          {{ deletingId() === child.id ? '…' : 'Delete' }}
                        </button>
                        @if ((child.activeListingCount ?? 0) > 0) {
                          <span class="small muted">({{ child.activeListingCount }} active)</span>
                        }
                      </div>
                    </div>
                  }
                } @empty {
                  <p class="muted pad">No sub-categories yet.</p>
                }
              </div>
              @if (showSubAddForm()) {
                <div class="cat-list inline-add-form">
                  <div class="cat-row">
                    <div class="inline-edit-fields">
                      <label>Name *<input [(ngModel)]="subAddForm.name" name="san" (input)="onSubNameInput()" /></label>
                      <label>Slug <input [(ngModel)]="subAddForm.slug" name="sas" class="slug-preview" readonly /></label>
                      <label>Icon <span class="muted small">(icon name, e.g. wrench)</span>
                        <input [(ngModel)]="subAddForm.icon" name="sai" />
                      </label>
                      <label class="inline-check">
                        <input type="checkbox" [(ngModel)]="subAddForm.published" name="sap" />
                        Published
                      </label>
                    </div>
                    @if (subAddError()) { <p class="err">{{ subAddError() }}</p> }
                    <div class="modal-actions">
                      <button class="btn-ghost btn-xs" (click)="cancelSubAdd()">Cancel</button>
                      <button class="btn-primary btn-xs" (click)="saveNewSub()" [disabled]="savingSubAdd()">
                        {{ savingSubAdd() ? '…' : 'Create' }}
                      </button>
                    </div>
                  </div>
                </div>
              } @else {
                <button class="btn-ghost btn-sm top-gap" (click)="openSubAddForm()">+ New sub-category</button>
              }
            }
          </div>
        }

        @if (section() === 'imagery') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">Banner and colour wash shown on the customer browse card. Upload a thumbnail or paste a URL.</p>
              <!-- Thumbnail upload -->
              <div class="thumb-upload">
                <span class="label-text">Category Thumbnail</span>
                <div class="thumb-upload-row">
                  <input [(ngModel)]="imagery.imageUrl" name="ithumburl" placeholder="https://… or upload below" />
                  <label class="thumb-file-label">
                    <input type="file" accept="image/jpeg,image/png,image/webp" class="file-hidden" (change)="onThumbnailFile($event)" />
                    <span class="btn-ghost btn-xs">Upload</span>
                  </label>
                </div>
                @if (thumbnailUploading()) {
                  <span class="muted small">Uploading…</span>
                }
              </div>
              <div class="thumb-preview" [style.background]="imagery.cardColor || 'var(--color-bg)'">
                @if (imagery.bannerUrl) { <img class="thumb-banner" [src]="imagery.bannerUrl" alt="banner" /> }
                <div class="thumb-body">
                  @if (imagery.imageUrl || basics.imageUrl) {
                    <img class="thumb-photo" [src]="imagery.imageUrl || basics.imageUrl" alt="photo" />
                  }
                  <span class="thumb-name">{{ basics.name || editTarget()!.name }}</span>
                </div>
              </div>
              <label>Banner URL<input [(ngModel)]="imagery.bannerUrl" name="ibanner" placeholder="https://…" /></label>
              <label>Card colour wash
                <span class="color-row">
                  @if (imagery.cardColor) {
                    <input type="color" [(ngModel)]="imagery.cardColor" name="icolorpick" />
                    <input [(ngModel)]="imagery.cardColor" name="icolorhex" placeholder="#1e88e5" />
                    <button class="btn-ghost btn-xs" (click)="imagery.cardColor = ''">Clear</button>
                  } @else {
                    <button class="btn-ghost btn-sm" (click)="imagery.cardColor = '#1e88e5'">+ Add colour wash</button>
                  }
                </span>
              </label>
              @if (imageryMsg()) { <p class="row-msg" [class.err]="imageryIsError()">{{ imageryMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveImagery()" [disabled]="savingImagery()">
                  {{ savingImagery() ? 'Saving…' : 'Save imagery' }}
                </button>
              </div>
            }
          </div>
        }

        @if (section() === 'copy') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">Customer-facing content shown on the category browse page.</p>
              <label>Description
                <textarea rows="5" [(ngModel)]="copyForm.description" name="cdesc"
                          placeholder="Describe this category for customers…"></textarea>
              </label>
              <details class="copy-details">
                <summary>Tips for customers</summary>
                <div class="tips-list">
                  @for (tip of copyForm.tips; track $index) {
                    <div class="tip-row">
                      <input [(ngModel)]="copyForm.tips[$index]" [name]="'tip' + $index" placeholder="e.g. Clear the area around the unit" />
                      <button class="btn-ghost btn-xs" (click)="removeTip($index)">✕</button>
                    </div>
                  }
                  <button class="btn-ghost btn-xs" (click)="addTip()">+ Add tip</button>
                </div>
              </details>
              <details class="copy-details">
                <summary>FAQ entries</summary>
                <div class="faq-list">
                  @for (faq of copyForm.faqEntries; track $index; let fi = $index) {
                    <div class="faq-entry">
                      <input [(ngModel)]="faq.question" [name]="'faqq' + fi" placeholder="Question" />
                      <textarea rows="2" [(ngModel)]="faq.answer" [name]="'faqa' + fi" placeholder="Answer"></textarea>
                      <button class="btn-ghost btn-xs" (click)="removeFaq(fi)">✕</button>
                    </div>
                  }
                  <button class="btn-ghost btn-xs" (click)="addFaq()">+ Add FAQ</button>
                </div>
              </details>
              @if (copyMsg()) { <p class="row-msg" [class.err]="copyIsError()">{{ copyMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveCopy()" [disabled]="savingCopy()">
                  {{ savingCopy() ? 'Saving…' : 'Save description' }}
                </button>
              </div>
            }
          </div>
        }

        @if (section() === 'dispatch') {
          <div class="section-body">
            @if (!editTarget()) {
              <p class="muted">Save basics first.</p>
            } @else {
              <p class="muted small">
                Travel fee and supplies fee baselines for this category.
                Effective baseline = max(here, overall platform setting in Financial Settings).
                The baseline portion is passed 100% to the servicer (0% platform commission);
                the extra above baseline is subject to the normal platform fee.
              </p>
              <label>Travel fee baseline (RM)
                <input type="number" min="0" step="0.50" [(ngModel)]="dispatchForm.travelFeeBaseline" name="dtfb" placeholder="Leave blank to use overall only" />
              </label>
              <label>Cleaning supplies fee baseline (RM)
                <input type="number" min="0" step="0.50" [(ngModel)]="dispatchForm.suppliesFeeBaseline" name="dsfb" placeholder="Leave blank to use overall only" />
              </label>
              <div class="dispatch-divider"></div>
              <label class="inline-check">
                <input type="checkbox" [(ngModel)]="dispatchForm.photosEnabled" name="dphotos" />
                Request photos <span class="muted small">(show optional photo upload on the quote form for this category)</span>
              </label>
              <div class="dispatch-divider"></div>
              <p class="muted small">
                Inspection-first flow: when enabled, a servicer listing under this category requires
                an on-site inspection visit before a real quote is issued.
                <br/><em>Note: The full inspection-first booking sub-flow is a planned future phase (SP5). Enabling this flag now persists the setting and displays it to servicers, but does not yet change the booking flow.</em>
              </p>
              <label class="inline-check">
                <input type="checkbox" [(ngModel)]="dispatchForm.requiresInspection" name="dinsp" />
                Requires inspection before quote
              </label>
              <label>Procedure (shown to customer)
                <textarea rows="4" [(ngModel)]="dispatchForm.procedure" name="dproc"
                          placeholder="e.g. 1. Inspect leak source  2. Chemical wash  3. Pressure test  4. Final check"></textarea>
              </label>
              @if (dispatchMsg()) { <p class="row-msg" [class.err]="dispatchIsError()">{{ dispatchMsg() }}</p> }
              <div class="modal-actions">
                <button class="btn-primary" (click)="saveDispatch()" [disabled]="savingDispatch()">
                  {{ savingDispatch() ? 'Saving…' : 'Save dispatch settings' }}
                </button>
              </div>
              <p class="muted small top-gap">
                SP4 dispatch defaults (order-accept prompt timeout, matching defaults) will be added here when live dispatch ships.
              </p>
            }
          </div>
        }
      </app-modal>
    }

    @if (questionEditorOpen()) {
      <app-modal [open]="true"
                 [title]="editingQIdx() === -1 ? 'Add question' : 'Edit question'"
                 (closed)="questionEditorOpen.set(false)">
        <div class="q-form">
          <label>Label *<input [(ngModel)]="qf.label" name="ql" required /></label>
          @if (editingQIdx() === -1) {
            <p class="muted small">Key is auto-generated from the label on save and cannot be changed later.</p>
          } @else {
            <div class="field-readonly">
              <span class="small muted">Key (locked)</span>
              <span class="mono">{{ editorSchema()[editingQIdx()].key }}</span>
            </div>
          }
          <label>Type
            <select [(ngModel)]="qf.type" name="qt">
              <option value="radio">Radio - pick one</option>
              <option value="checkbox">Checkbox - pick many</option>
              <option value="text">Text - free answer</option>
              <option value="quantity">Quantity - per-option count stepper</option>
              <option value="number">Number - single numeric input</option>
            </select>
          </label>
          <label class="inline-check">
            <input type="checkbox" [(ngModel)]="qf.required" name="qreq" /> Required
          </label>
          <label class="inline-check">
            <input type="checkbox" [(ngModel)]="qf.priced" name="qpriced" /> Priced (servicer sets per-option prices)
          </label>
          <label>Description (optional)<input [(ngModel)]="qf.description" name="qdesc" /></label>
          @if (qf.type !== 'text' && qf.type !== 'number') {
            <div class="opts-section">
              <strong class="small">Options</strong>
              <div cdkDropList (cdkDropListDropped)="dropOption($event)" class="opts-list">
                @for (opt of qf.options; track opt; let oi = $index) {
                  <div class="opt-row" cdkDrag>
                    <span class="drag-handle" cdkDragHandle>⠿</span>
                    @if (!opt.isNew) {
                      <span class="mono small locked">{{ opt.value }}</span>
                      <input [(ngModel)]="opt.label" [name]="'ol' + oi" placeholder="Label" />
                      <label class="small inline-check">
                        <input type="checkbox" [checked]="opt.active" (change)="toggleOptionActive(oi, $event)" /> Active
                      </label>
                    } @else {
                      <input [(ngModel)]="opt.label" [name]="'ol' + oi" placeholder="Label (value auto-generated)" />
                    }
                    <button class="btn-ghost btn-xs" (click)="removeOption(oi)">✕</button>
                  </div>
                }
              </div>
              <button class="btn-ghost btn-xs top-gap" (click)="addOption()">+ Add option</button>
            </div>
          }
          @if (qFormError()) { <p class="err">{{ qFormError() }}</p> }
          <div class="modal-actions">
            <button class="btn-ghost" (click)="questionEditorOpen.set(false)">Cancel</button>
            <button class="btn-primary" (click)="saveQuestion()" [disabled]="savingQuestion()">
              {{ savingQuestion() ? 'Checking…' : editingQIdx() === -1 ? 'Add question' : 'Update question' }}
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
    styles: [`
    :host { display: block; }
    .list-actions { display: flex; justify-content: flex-end; margin-bottom: 0.8rem; }
    .search-input { flex: 1; max-width: 280px; }
    .sort-select { font-size: 0.82rem; }
    .filter-chips { display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .filter-chip { font-size: 0.78rem; padding: 0.625rem 0.7rem; border-radius: 999px; border: 1px solid var(--color-border); cursor: pointer; user-select: none; }
    .filter-chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    .btn-sm { font-size: 0.82rem; padding: 0.625rem 0.7rem; }
    .btn-xs { font-size: 0.75rem; padding: 0.625rem 0.7rem; }
    .btn-ghost { display: inline-flex; align-items: center; gap: 0.2rem; cursor: pointer; }
    .btn-ghost.danger { color: var(--color-danger); }
    .bulk-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.8rem; background: var(--color-primary-light, #eff6ff); border: 1px solid var(--color-border); border-radius: var(--radius-md, 6px); margin-bottom: 0.5rem; max-width: 760px; }
    .bulk-count { font-size: 0.85rem; font-weight: 600; flex: 1; }
    .cb-wrap { display: flex; align-items: center; flex-shrink: 0; }
    .cb-wrap input { width: 16px; height: 16px; cursor: pointer; }
    .cat-row.header { background: var(--color-bg-alt, #fafafa); }
    .cat-list { border: 1px solid var(--color-border); border-radius: var(--radius-md, 6px); overflow: hidden; max-width: 760px; }
    .cat-row { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0.8rem; border-bottom: 1px solid var(--color-border); }
    .cat-row:last-child { border-bottom: none; }
    .cat-meta { display: flex; align-items: center; gap: 0.5rem; flex: 1; flex-wrap: wrap; }
    .cat-name { font-size: 0.9rem; font-weight: 500; }
    .cat-slug { font-size: 0.78rem; }
    .cat-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }
    .pad { padding: 0.8rem; }
    .top-gap { margin-top: 0.5rem; }
    .muted { color: var(--color-muted); }
    .small { font-size: 0.82rem; }
    .mono { font-family: monospace; font-size: 0.82rem; }
    .err { color: var(--color-danger); font-size: 0.85rem; }
    .row-msg { font-size: 0.8rem; color: var(--color-success); }
    .row-msg.err { color: var(--color-danger); }
    .badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 999px; border: 1px solid var(--color-border); }
    .badge.unpublished { background: var(--color-warning-bg, #fef9ec); color: var(--color-warning, #b45309); border-color: var(--color-warning-bg, #fef9ec); }
    .badge.listings { background: var(--color-primary-light, #eff6ff); color: var(--color-primary); border-color: var(--color-primary-light, #eff6ff); }
    .badge.price { background: #f0fdf4; color: #166534; border-color: #f0fdf4; }
    .badge.priced { background: var(--color-primary-light); color: var(--color-primary); border-color: var(--color-primary-light); }
    .badge.off { background: var(--color-danger-bg, #f8edec); color: var(--color-danger); border-color: var(--color-danger-bg, #f8edec); }
    .section-tabs { display: flex; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; gap: 0; }
    .stab { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 0.5rem 1rem; font-size: 0.88rem; color: var(--color-muted); cursor: pointer; }
    .stab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
    .section-body { display: flex; flex-direction: column; gap: 0.7rem; }
    .section-body label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
    .inline-check { flex-direction: row !important; align-items: center; gap: 0.4rem !important; font-weight: 400 !important; }
    .field-readonly { display: flex; flex-direction: column; gap: 0.2rem; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.6rem; }
    .schema-list { display: flex; flex-direction: column; gap: 0.3rem; }
    .schema-item { border: 1px solid var(--color-border); border-radius: 4px; padding: 0.4rem 0.6rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: var(--color-bg); cursor: grab; }
    .schema-item.inactive { opacity: 0.5; }
    .schema-item-hd { display: flex; align-items: center; gap: 0.5rem; flex: 1; flex-wrap: wrap; }
    .drag-handle { color: var(--color-muted); font-size: 1.1rem; line-height: 1; }
    .q-label { font-size: 0.88rem; }
    .schema-item-actions { display: flex; gap: 0.3rem; }
    .range-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; }
    .range-row input { width: 100px; }
    .slot-chips { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
    .slot-chip { font-size: 0.8rem; padding: 0.625rem 0.7rem; border-radius: 999px; border: 1px solid var(--color-border); cursor: pointer; user-select: none; }
    .slot-chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    .q-form { display: flex; flex-direction: column; gap: 0.7rem; }
    .q-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; font-weight: 500; }
    .opts-section { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.6rem; background: var(--color-bg); border-radius: 4px; border: 1px solid var(--color-border); }
    .opts-list { display: flex; flex-direction: column; gap: 0.3rem; }
    .opt-row { display: flex; align-items: center; gap: 0.4rem; background: var(--color-surface, #fff); padding: 0.3rem 0.5rem; border-radius: 4px; border: 1px solid var(--color-border); }
    .opt-row input:not([type=checkbox]) { flex: 1; }
    .locked { min-width: 80px; }
    .section-body textarea { font-family: inherit; font-size: 0.9rem; padding: 0.4rem 0.5rem; border: 1px solid var(--color-border); border-radius: 4px; resize: vertical; }
    .color-row { display: flex; align-items: center; gap: 0.4rem; }
    .color-row input[type=color] { width: 38px; height: 30px; padding: 0; border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; }
    .color-row input:not([type=color]) { flex: 1; max-width: 140px; }
    .thumb-preview { border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; max-width: 280px; }
    .thumb-banner { display: block; width: 100%; height: 70px; object-fit: cover; }
    .thumb-body { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; }
    .thumb-photo { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; }
    .thumb-name { font-size: 0.9rem; font-weight: 600; }
    .cdk-drag-preview { box-shadow: 0 4px 16px rgba(0,0,0,0.15); opacity: 0.95; border-radius: 4px; }
    .cdk-drag-placeholder { opacity: 0.25; }
    .cdk-drop-list-dragging .schema-item:not(.cdk-drag-placeholder),
    .cdk-drop-list-dragging .opt-row:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0,0,0.2,1); }
    .cat-icon { font-size: 1.1rem; width: 24px; text-align: center; flex-shrink: 0; }
    .inline-edit-fields { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; }
    .inline-edit-fields label input { width: 100%; }
    .inline-edit-row { flex-direction: column; align-items: stretch; gap: 0.5rem; background: var(--color-bg-alt, #fafafa); }
    .inline-add-form { margin-top: 0.5rem; }
    .slug-preview { background: var(--color-bg-alt, #f5f5f5); color: var(--color-muted); cursor: default; }
    .dispatch-divider { border-top: 1px solid var(--color-border); margin: 0.4rem 0; }
    .thumb-upload { display: flex; flex-direction: column; gap: 0.3rem; }
    .thumb-upload-row { display: flex; gap: 0.4rem; align-items: center; }
    .thumb-upload-row input { flex: 1; }
    .thumb-file-label { cursor: pointer; }
    .file-hidden { display: none; }
    .copy-details { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.5rem 0.7rem; font-size: 0.85rem; }
    .copy-details summary { cursor: pointer; font-weight: 600; color: var(--color-muted); }
    .tips-list, .faq-list { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.4rem; }
    .tip-row, .faq-entry { display: flex; gap: 0.35rem; align-items: flex-start; }
    .tip-row input { flex: 1; }
    .faq-entry { flex-direction: column; padding: 0.4rem; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); }
    .faq-entry input { font-weight: 600; }
    .faq-entry textarea { font-family: inherit; font-size: 0.85rem; resize: vertical; }
  `]
})
export class AdminCategorySettingsComponent implements OnInit {
  private api = inject(ApiService);
  private pin = inject(PinService);
  private dialog = inject(DialogService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  loadFailed = signal(false);
  categories = signal<Category[]>([]);
  searchSignal = signal('');
  sortSignal = signal('name-asc');
  get searchQuery(): string { return this.searchSignal(); }
  set searchQuery(v: string) { this.searchSignal.set(v); }
  get sortOption(): string { return this.sortSignal(); }
  set sortOption(v: string) { this.sortSignal.set(v); }
  filterHasQuestions = signal(false);
  filterPublishedOnly = signal(false);
  filterTopLevel = signal(false);
  deletingId = signal<string | null>(null);
  deleteError = signal('');

  selectedIds = signal<Set<string>>(new Set());
  bulkBusy = signal(false);
  bulkError = signal('');

  selectedCount = computed(() => this.selectedIds().size);
  allSelected = computed(() => this.filteredCategories().length > 0 && this.filteredCategories().every((c) => this.selectedIds().has(c.id)));

  filteredCategories = computed(() => {
    let list = this.categories().filter(
      (c) => !c.deletedAt &&
        (!this.searchSignal() || c.name.toLowerCase().includes(this.searchSignal().toLowerCase())),
    );
    if (this.filterHasQuestions()) list = list.filter((c) => (c.questionSchema?.length ?? 0) > 0);
    if (this.filterPublishedOnly()) list = list.filter((c) => c.published);
    if (this.filterTopLevel()) list = list.filter((c) => !c.parentCategoryId);
    const sort = this.sortSignal();
    if (sort === 'name-desc') return [...list].sort((a, b) => b.name.localeCompare(a.name));
    if (sort === 'listings-desc') return [...list].sort((a, b) => (b.activeListingCount ?? 0) - (a.activeListingCount ?? 0));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  });


  editorOpen = signal(false);
  editTarget = signal<Category | null>(null);
  section = signal<DetailSection>('basics');

  basics = { name: '', slug: '', icon: '', imageUrl: '', defaultPriceSuggestion: null as number | null, defaultEstimatedDurationMinutes: null as number | null, published: false, parentCategoryId: null as string | null };
  basicsError = signal('');
  savingBasics = signal(false);

  editorSchema = signal<QuestionItem[]>([]);
  savingSchema = signal(false);
  schemaError = signal('');
  questionEditorOpen = signal(false);
  editingQIdx = signal<number>(-1);
  qf: QForm = { label: '', type: 'radio', required: false, priced: false, description: '', options: [] };
  qFormError = signal('');
  savingQuestion = signal(false);

  private rawBudgetRanges = signal<Record<string, RangeRow[]>>({});
  currentRanges = signal<RangeRow[]>([]);
  savingBudget = signal(false);
  budgetMsg = signal('');
  budgetIsError = signal(false);

  editorSlots = signal<Set<string>>(new Set());
  savingSlots = signal(false);
  slotsMsg = signal('');
  slotsIsError = signal(false);

  // ── Sub-categories tab (inline CRUD) ──
  showSubAddForm = signal(false);
  subAddForm = { name: '', slug: '', icon: '', published: true };
  savingSubAdd = signal(false);
  subAddError = signal('');
  editingSubId = signal<string | null>(null);
  editingSubForm = { name: '', icon: '', published: false };
  savingSubEdit = signal(false);
  subEditError = signal('');

  // ── Imagery (Thumbnail tab) ── (card photo = basics.imageUrl; this tab owns banner + colour + thumbnail upload)
  imagery = { bannerUrl: '', cardColor: '', imageUrl: '' };
  savingImagery = signal(false);
  imageryMsg = signal('');
  imageryIsError = signal(false);
  thumbnailUploading = signal(false);

  // ── Customer copy tab ──
  copyForm = { description: '', tips: [] as string[], faqEntries: [] as { question: string; answer: string }[] };
  savingCopy = signal(false);
  copyMsg = signal('');
  copyIsError = signal(false);

  // ── Dispatch / pricing tab (travel fee baseline, supplies baseline, inspection, procedure, photosEnabled) ──
  dispatchForm = {
    travelFeeBaseline: null as number | null,
    suppliesFeeBaseline: null as number | null,
    requiresInspection: false,
    procedure: '',
    photosEnabled: false,
  };
  savingDispatch = signal(false);
  dispatchMsg = signal('');
  dispatchIsError = signal(false);

  childCategories = computed(() => {
    const t = this.editTarget();
    if (!t) return [];
    return this.categories().filter((c) => c.parentCategoryId === t.id && c.id !== t.id && !c.deletedAt);
  });

  readonly ALL_TIME_SLOTS = ALL_TIME_SLOTS;
  readonly TIME_SLOT_LABELS = TIME_SLOT_LABELS;

  ngOnInit(): void {
    this.api.get<{ data: Category[] }>('/admin/categories').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => { this.categories.set(r.data ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        const byKey = new Map(r.data.map((s) => [s.key, s.value]));
        const br = byKey.get('budget_ranges') as { ranges: Record<string, RangeRow[]> } | undefined;
        if (br?.ranges && !Array.isArray(br.ranges)) this.rawBudgetRanges.set(br.ranges);
      },
      error: () => {},
    });
  }

  openNew(parentCategoryId: string | null = null): void {
    this.editTarget.set(null);
    this.basics = { name: '', slug: '', icon: '', imageUrl: '', defaultPriceSuggestion: null, defaultEstimatedDurationMinutes: null, published: false, parentCategoryId };
    this.basicsError.set('');
    this.editorSchema.set([]);
    this.editorSlots.set(new Set(ALL_TIME_SLOTS));
    this.currentRanges.set([]);
    this.imagery = { bannerUrl: '', cardColor: '', imageUrl: '' };
    this.copyForm = { description: '', tips: [], faqEntries: [] };
    this.dispatchForm = { travelFeeBaseline: null, suppliesFeeBaseline: null, requiresInspection: false, procedure: '', photosEnabled: false };
    this.section.set('basics');
    this.editorOpen.set(true);
  }

  /** Open a fresh create flow for a child of the category currently being edited. */
  openNewSub(): void {
    const parent = this.editTarget();
    if (parent) this.openNew(parent.id);
  }

  toggleSelect(id: string): void {
    this.selectedIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.filteredCategories().map((c) => c.id)));
    }
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkError.set('');
  }

  bulkPublish(published: boolean): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.bulkBusy.set(true);
    this.bulkError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) { this.bulkBusy.set(false); return; }
      this.api.post<{ updated: number }>('/admin/categories/bulk-publish', { ids, published }, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.bulkBusy.set(false);
          this.categories.update((list) => list.map((c) => ids.includes(c.id) ? { ...c, published } : c));
          this.selectedIds.set(new Set());
        },
        error: (e: { message?: string }) => {
          this.bulkBusy.set(false);
          this.bulkError.set(e.message ?? 'Bulk operation failed');
        },
      });
    });
  }

  openEdit(cat: Category): void {
    this.editTarget.set(cat);
    this.basics = {
      name: cat.name, slug: cat.slug, icon: cat.icon ?? '', imageUrl: cat.imageUrl ?? '',
      defaultPriceSuggestion: cat.defaultPriceSuggestion != null ? Number(cat.defaultPriceSuggestion) : null,
      defaultEstimatedDurationMinutes: cat.defaultEstimatedDurationMinutes ?? null,
      published: cat.published,
      parentCategoryId: cat.parentCategoryId ?? null,
    };
    this.basicsError.set('');
    this.editorSchema.set(JSON.parse(JSON.stringify(cat.questionSchema ?? [])));
    this.editorSlots.set(new Set(cat.allowedTimeSlots ?? ALL_TIME_SLOTS));
    const raw = this.rawBudgetRanges();
    this.currentRanges.set(raw[cat.id] ? raw[cat.id].map((r) => ({ ...r })) : []);
    this.imagery = { bannerUrl: cat.bannerUrl ?? '', cardColor: cat.cardColor ?? '', imageUrl: cat.imageUrl ?? '' };
    const parsedTips = (cat as unknown as Record<string, unknown>)['tips'];
    const parsedFaq = (cat as unknown as Record<string, unknown>)['faqEntries'];
    this.copyForm = {
      description: cat.description ?? '',
      tips: Array.isArray(parsedTips) ? [...parsedTips] as string[] : [],
      faqEntries: Array.isArray(parsedFaq) ? [...parsedFaq] as { question: string; answer: string }[] : [],
    };
    this.dispatchForm = {
      travelFeeBaseline: cat.travelFeeBaseline != null ? Number(cat.travelFeeBaseline) : null,
      suppliesFeeBaseline: cat.suppliesFeeBaseline != null ? Number(cat.suppliesFeeBaseline) : null,
      requiresInspection: cat.requiresInspection ?? false,
      procedure: cat.procedure ?? '',
      photosEnabled: cat.photosEnabled ?? false,
    };
    this.imageryMsg.set(''); this.copyMsg.set(''); this.dispatchMsg.set('');
    this.section.set('basics');
    this.editorOpen.set(true);
  }

  closeEditor(): void { this.editorOpen.set(false); }

  confirmDelete(cat: Category): void {
    this.dialog.confirm('Delete "' + cat.name + '"?', {
      detail: 'This is permanent if no listings or quotes exist for this category.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    }).subscribe((confirmed) => {
      if (!confirmed) return;
      this.deleteError.set('');
      this.deletingId.set(cat.id);
      this.pin.requirePin().subscribe((pin) => {
        if (!pin) { this.deletingId.set(null); return; }
        this.api.delete<{ ok: boolean }>('/admin/categories/' + cat.id, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => {
            this.deletingId.set(null);
            this.categories.update((list) => list.filter((c) => c.id !== cat.id));
          },
          error: (e: { message?: string }) => {
            this.deletingId.set(null);
            this.deleteError.set(e.message ?? 'Delete failed');
          },
        });
      });
    });
  }

  saveBasics(): void {
    if (!this.basics.name.trim()) { this.basicsError.set('Name is required.'); return; }
    this.basicsError.set('');
    const cat = this.editTarget();
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingBasics.set(true);
      const body: Record<string, unknown> = {
        name: this.basics.name.trim(),
        icon: this.basics.icon.trim() || null,
        imageUrl: this.basics.imageUrl.trim() || null,
        defaultPriceSuggestion: this.basics.defaultPriceSuggestion,
        defaultEstimatedDurationMinutes: this.basics.defaultEstimatedDurationMinutes,
        published: this.basics.published,
      };
      const req$ = cat
        ? this.api.patch<Category>('/admin/categories/' + cat.id, body, { 'x-action-pin': pin })
        : this.api.post<Category>('/admin/categories',
            { ...body, slug: this.basics.slug.trim() || undefined, parentCategoryId: this.basics.parentCategoryId },
            { 'x-action-pin': pin });
      req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingBasics.set(false);
          if (cat) {
            this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
            this.editTarget.set({ ...cat, ...updated });
          } else {
            this.categories.update((list) => [...list, updated]);
            this.editTarget.set(updated);
          }
          this.section.set('schema');
        },
        error: (e: { message?: string }) => { this.savingBasics.set(false); this.basicsError.set(e.message ?? 'Save failed'); },
      });
    });
  }

  dropQuestion(event: CdkDragDrop<QuestionItem[]>): void {
    const arr = [...this.editorSchema()];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.editorSchema.set(arr);
  }

  toggleQuestionActive(idx: number): void {
    const arr = [...this.editorSchema()];
    const q = arr[idx];
    arr[idx] = { ...q, active: q.active === false ? undefined : false };
    this.editorSchema.set(arr);
  }

  openQuestionEditor(idx: number): void {
    this.editingQIdx.set(idx);
    if (idx === -1) {
      this.qf = { label: '', type: 'radio', required: false, priced: false, description: '', options: [] };
    } else {
      const q = this.editorSchema()[idx];
      this.qf = {
        label: q.label, type: q.type,
        required: q.required ?? false, priced: q.priced ?? false,
        description: q.description ?? '',
        options: (q.options ?? []).map((o) => ({
          value: o.value, label: o.label, active: o.active !== false, isNew: false,
        })),
      };
    }
    this.qFormError.set('');
    this.questionEditorOpen.set(true);
  }

  addOption(): void { this.qf.options.push({ value: '', label: '', active: true, isNew: true }); }
  removeOption(i: number): void { this.qf.options.splice(i, 1); }
  toggleOptionActive(i: number, event: Event): void {
    this.qf.options[i].active = (event.target as HTMLInputElement).checked;
  }
  dropOption(event: CdkDragDrop<QForm['options']>): void {
    moveItemInArray(this.qf.options, event.previousIndex, event.currentIndex);
  }

  saveQuestion(): void {
    if (!this.qf.label.trim()) { this.qFormError.set('Label is required.'); return; }
    const toKey = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const idx = this.editingQIdx();
    const arr = [...this.editorSchema()];

    const doSave = () => {
      if (idx === -1) {
        const key = toKey(this.qf.label);
        if (!key) { this.qFormError.set('Label must produce a valid key.'); return; }
        if (arr.some((q) => q.key === key)) { this.qFormError.set('Key "' + key + '" already exists.'); return; }
        const options: QuestionOption[] = this.qf.options.map((o, i) => ({
          value: toKey(o.label) || 'opt' + i,
          label: o.label,
          sortOrder: i,
          active: o.active ? undefined : false,
        }));
        arr.push({
          key, label: this.qf.label.trim(), type: this.qf.type,
          required: this.qf.required || undefined, priced: this.qf.priced || undefined,
          description: this.qf.description.trim() || undefined,
          sortOrder: arr.length,
          options: options.length ? options : undefined,
        });
      } else {
        const existing = arr[idx];
        const mergedOptions: QuestionOption[] = this.qf.options.map((o, i) => ({
          value: o.isNew ? (toKey(o.label) || 'opt' + i) : o.value,
          label: o.label,
          sortOrder: i,
          active: o.active ? undefined : false,
        }));
        arr[idx] = {
          ...existing,
          label: this.qf.label.trim(), type: this.qf.type,
          required: this.qf.required || undefined, priced: this.qf.priced || undefined,
          description: this.qf.description.trim() || undefined,
          options: mergedOptions.length ? mergedOptions : undefined,
        };
      }
      this.editorSchema.set(arr);
      this.questionEditorOpen.set(false);
    };

    if (idx !== -1 && this.editTarget()) {
      const existing = arr[idx];
      const pricedFlipped = !!this.qf.priced !== !!existing.priced;
      if (pricedFlipped) {
        const catId = this.editTarget()!.id;
        this.savingQuestion.set(true);
        this.api.get<{ key: string; count: number }>('/admin/categories/' + catId + '/question-impact?key=' + existing.key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (impact) => {
            this.savingQuestion.set(false);
            if (impact.count > 0) {
              const action = this.qf.priced
                ? 'Enabling pricing on "' + existing.key + '" will require servicers to set per-option prices for ' + impact.count + ' existing listing(s).'
                : 'Disabling pricing on "' + existing.key + '" will make existing modifier data unused for ' + impact.count + ' listing(s).';
              this.dialog.confirm(action, { confirmLabel: 'Proceed', cancelLabel: 'Cancel' }).subscribe((ok) => {
                if (ok) doSave();
              });
            } else {
              doSave();
            }
          },
          error: () => { this.savingQuestion.set(false); doSave(); },
        });
        return;
      }
    }
    doSave();
  }

  saveSchema(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.schemaError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingSchema.set(true);
      this.api.patch<Category>('/admin/categories/' + cat.id, { questionSchema: this.editorSchema() }, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingSchema.set(false);
          this.editorSchema.set(JSON.parse(JSON.stringify(updated.questionSchema ?? [])));
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
        },
        error: (e: { message?: string }) => { this.savingSchema.set(false); this.schemaError.set(e.message ?? 'Save failed'); },
      });
    });
  }

  addRange(): void { this.currentRanges.update((r) => [...r, { min: null, max: null }]); }
  removeRange(i: number): void { this.currentRanges.update((r) => r.filter((_, j) => j !== i)); }

  saveBudgetRanges(): void {
    const cat = this.editTarget();
    if (!cat) return;
    const ranges = this.currentRanges().filter((r) => r.min != null);
    this.budgetMsg.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingBudget.set(true);
      const allRanges = { ...this.rawBudgetRanges(), [cat.id]: ranges };
      this.api.patch('/admin/settings', { key: 'budget_ranges', value: { ranges: allRanges } }, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.savingBudget.set(false);
          this.rawBudgetRanges.set(allRanges);
          this.budgetMsg.set('Budget ranges saved.');
          this.budgetIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingBudget.set(false); this.budgetMsg.set(e.message ?? 'Save failed'); this.budgetIsError.set(true); },
      });
    });
  }

  toggleSlot(slot: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editorSlots.update((s) => {
      const next = new Set(s);
      if (checked) next.add(slot); else next.delete(slot);
      return next;
    });
  }

  saveSlots(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.slotsMsg.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingSlots.set(true);
      const slots = [...this.editorSlots()];
      this.api.patch<Category>('/admin/categories/' + cat.id, { allowedTimeSlots: slots }, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingSlots.set(false);
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
          this.slotsMsg.set('Saved.');
          this.slotsIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingSlots.set(false); this.slotsMsg.set(e.message ?? 'Save failed'); this.slotsIsError.set(true); },
      });
    });
  }

  saveImagery(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.imageryMsg.set('');
    this.pin.requirePin().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pin) => {
      if (!pin) return;
      this.savingImagery.set(true);
      const body = {
        bannerUrl: this.imagery.bannerUrl.trim() || null,
        cardColor: this.imagery.cardColor.trim() || null,
        imageUrl: this.imagery.imageUrl.trim() || null,
      };
      this.api.patch<Category>('/admin/categories/' + cat.id, body, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingImagery.set(false);
          this.basics.imageUrl = updated.imageUrl ?? '';
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
          this.imageryMsg.set('Saved.');
          this.imageryIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingImagery.set(false); this.imageryMsg.set(e.message ?? 'Save failed'); this.imageryIsError.set(true); },
      });
    });
  }

  saveCopy(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.copyMsg.set('');
    this.pin.requirePin().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pin) => {
      if (!pin) return;
      this.savingCopy.set(true);
      const tips = this.copyForm.tips.filter((t) => t.trim()).map((t) => t.trim());
      const faqEntries = this.copyForm.faqEntries.filter((f) => f.question.trim() && f.answer.trim());
      const body: Record<string, unknown> = { description: this.copyForm.description.trim() || null };
      if (tips.length > 0) body['tips'] = tips;
      if (faqEntries.length > 0) body['faqEntries'] = faqEntries;
      this.api.patch<Category>('/admin/categories/' + cat.id, body, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingCopy.set(false);
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
          this.copyMsg.set('Saved.');
          this.copyIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingCopy.set(false); this.copyMsg.set(e.message ?? 'Save failed'); this.copyIsError.set(true); },
      });
    });
  }

  saveDispatch(): void {
    const cat = this.editTarget();
    if (!cat) return;
    this.dispatchMsg.set('');
    this.pin.requirePin().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pin) => {
      if (!pin) return;
      this.savingDispatch.set(true);
      const body = {
        travelFeeBaseline: this.dispatchForm.travelFeeBaseline,
        suppliesFeeBaseline: this.dispatchForm.suppliesFeeBaseline,
        requiresInspection: this.dispatchForm.requiresInspection,
        procedure: this.dispatchForm.procedure.trim() || null,
        photosEnabled: this.dispatchForm.photosEnabled,
      };
      this.api.patch<Category>('/admin/categories/' + cat.id, body, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingDispatch.set(false);
          this.categories.update((list) => list.map((c) => c.id === cat.id ? { ...c, ...updated } : c));
          this.editTarget.set({ ...cat, ...updated });
          this.dispatchMsg.set('Saved.');
          this.dispatchIsError.set(false);
        },
        error: (e: { message?: string }) => { this.savingDispatch.set(false); this.dispatchMsg.set(e.message ?? 'Save failed'); this.dispatchIsError.set(true); },
      });
    });
  }

  // ── Sub-categories tab ──────────────────────────────────────────────────
  openSubAddForm(): void {
    this.showSubAddForm.set(true);
    this.subAddForm = { name: '', slug: '', icon: '', published: true };
    this.subAddError.set('');
  }

  cancelSubAdd(): void {
    this.showSubAddForm.set(false);
    this.subAddError.set('');
  }

  onSubNameInput(): void {
    this.subAddForm.slug = this.subAddForm.name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  saveNewSub(): void {
    if (!this.subAddForm.name.trim()) { this.subAddError.set('Name is required.'); return; }
    this.subAddError.set('');
    const parent = this.editTarget();
    if (!parent) return;
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingSubAdd.set(true);
      const slug = this.subAddForm.slug || this.subAddForm.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      this.api.post<Category>('/admin/categories', {
        name: this.subAddForm.name.trim(),
        slug,
        icon: this.subAddForm.icon.trim() || null,
        published: this.subAddForm.published,
        parentCategoryId: parent.id,
      }, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (created) => {
          this.savingSubAdd.set(false);
          this.categories.update((list) => [...list, created]);
          this.showSubAddForm.set(false);
          this.subAddForm = { name: '', slug: '', icon: '', published: true };
        },
        error: (e: { message?: string }) => {
          this.savingSubAdd.set(false);
          this.subAddError.set(e.message ?? 'Create failed');
        },
      });
    });
  }

  openSubEdit(child: Category): void {
    this.editingSubId.set(child.id);
    this.editingSubForm = { name: child.name, icon: child.icon ?? '', published: child.published };
    this.subEditError.set('');
  }

  cancelSubEdit(): void {
    this.editingSubId.set(null);
    this.subEditError.set('');
  }

  saveEditSub(child: Category): void {
    if (!this.editingSubForm.name.trim()) { this.subEditError.set('Name is required.'); return; }
    this.subEditError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.savingSubEdit.set(true);
      this.api.patch<Category>('/admin/categories/' + child.id, {
        name: this.editingSubForm.name.trim(),
        icon: this.editingSubForm.icon.trim() || null,
        published: this.editingSubForm.published,
      }, { 'x-action-pin': pin }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (updated) => {
          this.savingSubEdit.set(false);
          this.categories.update((list) => list.map((c) => c.id === child.id ? { ...c, ...updated } : c));
          this.editingSubId.set(null);
        },
        error: (e: { message?: string }) => {
          this.savingSubEdit.set(false);
          this.subEditError.set(e.message ?? 'Update failed');
        },
      });
    });
  }

  // ── Thumbnail upload ──────────────────────────────────────────────────────
  private http = inject(HttpClient);

  onThumbnailFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.imageryMsg.set('Image must be under 5 MB.');
      this.imageryIsError.set(true);
      return;
    }
    this.thumbnailUploading.set(true);
    this.api.post<{ uploadUrl: string; fileId: string }>('/files/presign', {
      purpose: 'category_thumb', mimeType: file.type || 'image/jpeg', sizeBytes: file.size,
    }).pipe(
      switchMap(({ uploadUrl, fileId }) =>
        this.http.put(uploadUrl, file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }).pipe(
          switchMap(() => this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {})),
        ),
      ),
    ).subscribe({
      next: (r) => {
        this.thumbnailUploading.set(false);
        this.imagery.imageUrl = r.fileUrl;
        this.imageryIsError.set(false);
        this.imageryMsg.set('Thumbnail uploaded.');
        input.value = '';
      },
      error: () => {
        this.thumbnailUploading.set(false);
        this.imageryMsg.set('Upload failed.');
        this.imageryIsError.set(true);
      },
    });
  }

  // ── Tips & FAQ helpers ──────────────────────────────────────────────────
  addTip(): void { this.copyForm.tips = [...this.copyForm.tips, '']; }
  removeTip(i: number): void { this.copyForm.tips = this.copyForm.tips.filter((_, j) => j !== i); }
  addFaq(): void { this.copyForm.faqEntries = [...this.copyForm.faqEntries, { question: '', answer: '' }]; }
  removeFaq(i: number): void { this.copyForm.faqEntries = this.copyForm.faqEntries.filter((_, j) => j !== i); }
}
